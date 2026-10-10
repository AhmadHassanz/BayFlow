begin;

-- Minimal estimate choices for an assigned technician. Base inventory RLS,
-- stock/cost visibility, and write grants remain unchanged.
create function private.list_estimate_catalog_impl(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); b public.bookings; target_booking uuid;
  page_number integer := 1; key text; items jsonb; total bigint;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if input is null or jsonb_typeof(input) <> 'object' then
    raise exception 'Catalog input required' using errcode = '22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['bookingId', 'page']) then
      raise exception 'Unsupported catalog field' using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(input->'bookingId') is distinct from 'string'
    or not coalesce((input->>'bookingId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) then
    raise exception 'Booking required' using errcode = '22023'; end if;
  target_booking := (input->>'bookingId')::uuid;
  if input ? 'page' then
    if jsonb_typeof(input->'page') is distinct from 'number'
      or not coalesce((input->>'page') ~ '^[0-9]{1,5}$', false) then
      raise exception 'Page required' using errcode = '22023'; end if;
    page_number := (input->>'page')::integer;
  end if;
  if page_number not between 1 and 99999 then raise exception 'Page required' using errcode = '22023'; end if;

  select * into b from public.bookings where id = target_booking;
  if not found or b.technician_user_id is distinct from actor
    or not private.active_shop_role(b.shop_id, actor, array['TECHNICIAN']::public.shop_role[]) then
    raise exception 'Booking not found' using errcode = 'P0002'; end if;

  select count(*) into total from public.inventory_parts p where p.shop_id = b.shop_id and p.active;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sku', p.sku, 'name', p.name) order by p.sku, p.id), '[]'::jsonb)
    into items from (select p.id, p.sku, p.name from public.inventory_parts p
      where p.shop_id = b.shop_id and p.active order by p.sku, p.id
      limit 50 offset (page_number - 1) * 50) p;
  return jsonb_build_object('items', items, 'page', page_number, 'pageSize', 50, 'total', total);
end;
$$;

create function public.list_estimate_catalog(input jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.list_estimate_catalog_impl(input);
$$;
revoke all on function private.list_estimate_catalog_impl(jsonb), public.list_estimate_catalog(jsonb)
  from public, anon, authenticated;
grant execute on function private.list_estimate_catalog_impl(jsonb), public.list_estimate_catalog(jsonb) to authenticated;

commit;
