begin;

create or replace function public.list_my_bookings(input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input) <> 'object' then
    raise exception 'Invalid list input' using errcode='22023';
  end if;
  if input <> '{}'::jsonb then
    raise exception 'Unsupported list input' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_agg(private.list_booking_dto(b) order by b.created_at desc, b.id desc)
    from public.bookings b where b.customer_id = actor
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_bookings(jsonb) from public, anon, authenticated;
grant execute on function public.list_my_bookings(jsonb) to authenticated;

commit;
