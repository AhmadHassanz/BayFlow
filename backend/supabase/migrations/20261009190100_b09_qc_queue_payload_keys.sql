begin;

create or replace function private.list_qc_queue_impl(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_shop uuid; page_number integer; key text; items jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input)<>'object' then raise exception 'QC queue input required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['shopId','shop_id','shopid','page']) then raise exception 'Unsupported QC queue field' using errcode='22023'; end if;
  end loop;
  if coalesce(input->>'shopId', input->>'shop_id', input->>'shopid') is null
    or not coalesce(coalesce(input->>'shopId', input->>'shop_id', input->>'shopid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then
    raise exception 'Shop required' using errcode='22023'; end if;
  target_shop := coalesce(input->>'shopId', input->>'shop_id', input->>'shopid')::uuid;
  if not private.active_shop_member(target_shop, actor, 'QC') then
    raise exception 'QC queue forbidden' using errcode='42501'; end if;
  if input ? 'page' and (jsonb_typeof(input->'page')<>'number' or not coalesce((input->>'page') ~ '^[0-9]{1,5}$',false)) then
    raise exception 'Page required' using errcode='22023'; end if;
  page_number := coalesce((input->>'page')::integer,1);
  if page_number not between 1 and 99999 then raise exception 'Page required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(private.booking_action_dto(b) order by b.created_at, b.id),'[]'::jsonb) into items
    from (select * from public.bookings where shop_id=target_shop and status='QC_PENDING' and qc_claimed_by is null
      order by created_at,id limit 50 offset (page_number-1)*50) b;
  return jsonb_build_object('items',items,'page',page_number,'pageSize',50);
end;
$$;

commit;
