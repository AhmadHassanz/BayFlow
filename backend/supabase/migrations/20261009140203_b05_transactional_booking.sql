begin;

-- CREATE_BOOKING has its own receipt namespace: action is implicit in this table.
-- Private storage is not exposed through PostgREST and has no client privileges.
create table private.booking_receipts (
  customer_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (customer_id, idempotency_key)
);
alter table private.booking_receipts enable row level security;
revoke all on private.booking_receipts from public, anon, authenticated;

create function private.booking_creation_dto(b public.bookings)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',b.id,'shopId',b.shop_id,'customerId',b.customer_id,
    'vehicleId',b.vehicle_id,'slotId',b.slot_id,'status',b.status,'stateVersion',b.state_version,
    'symptomNotes',b.notes,'createdAt',b.created_at,'serviceIds',coalesce(
      (select jsonb_agg(bs.service_id order by bs.service_id) from public.booking_services bs
        where bs.booking_id=b.id and bs.shop_id=b.shop_id),'[]'::jsonb));
$$;

create function private.create_booking_impl(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); target_shop uuid; target_slot uuid; request_key uuid;
  s public.shops; a public.appointment_slots; v public.vehicles; b public.bookings;
  receipt private.booking_receipts; vehicle jsonb; canonical jsonb; services uuid[];
  notes text; plate text; vehicle_make text; vehicle_model text; vehicle_year integer;
  vehicle_color text; vehicle_mileage integer; key text; item jsonb; instant timestamptz;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  -- A per-identity lock serializes retries and same-customer vehicle reuse. The
  -- slot lock below independently serializes capacity across different customers.
  perform 1 from auth.users where id=actor for update;
  if not found then raise exception 'Sign in required' using errcode='42501'; end if;
  -- COUNT after a waiting slot lock requires fresh READ COMMITTED statements.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Retry transaction' using errcode='40001';
  end if;
  if input is null or jsonb_typeof(input)<>'object' then
    raise exception 'Booking payload required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['shopId','slotId','serviceIds','symptomNotes','vehicle','idempotencyKey']) then
      raise exception 'Unsupported booking field' using errcode='22023'; end if;
  end loop;
  foreach key in array array['shopId','slotId','idempotencyKey'] loop
    if jsonb_typeof(input->key) is distinct from 'string'
      or (input->>key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'UUID required' using errcode='22023'; end if;
  end loop;
  target_shop := (input->>'shopId')::uuid; target_slot := (input->>'slotId')::uuid;
  request_key := (input->>'idempotencyKey')::uuid;
  if jsonb_typeof(input->'serviceIds') is distinct from 'array' then
    raise exception 'Service list required' using errcode='22023'; end if;
  if jsonb_array_length(input->'serviceIds')>50 then
    raise exception 'Too many services' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(input->'serviceIds') loop
    if jsonb_typeof(item)<>'string' or (item#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid service ID' using errcode='22023'; end if;
  end loop;
  select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])
    into services from jsonb_array_elements_text(input->'serviceIds');
  if cardinality(services) <> (select count(distinct value) from unnest(services) value) then
    raise exception 'Duplicate service ID' using errcode='22023'; end if;
  if input ? 'symptomNotes' and jsonb_typeof(input->'symptomNotes')<>'string' then
    raise exception 'Text notes required' using errcode='22023'; end if;
  notes := btrim(coalesce(input->>'symptomNotes',''));
  if length(notes)>4000 or (cardinality(services)=0 and
    (length(notes)<10 or length(regexp_replace(notes,'[^[:alnum:]]','','g'))<5)) then
    raise exception 'Select services or describe symptoms' using errcode='22023'; end if;
  vehicle := input->'vehicle';
  if jsonb_typeof(vehicle) is distinct from 'object' then
    raise exception 'Vehicle required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(vehicle) loop
    if key <> all(array['registrationPlate','make','model','year','color','mileageKm']) then
      raise exception 'Unsupported vehicle field' using errcode='22023'; end if;
  end loop;
  foreach key in array array['registrationPlate','make','model'] loop
    if jsonb_typeof(vehicle->key) is distinct from 'string' then
      raise exception 'Vehicle text required' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(vehicle->'year') is distinct from 'number'
    or (vehicle->>'year') !~ '^[0-9]{4}$' then
    raise exception 'Vehicle year required' using errcode='22023'; end if;
  if vehicle ? 'color' and jsonb_typeof(vehicle->'color') not in ('string','null') then
    raise exception 'Invalid color' using errcode='22023'; end if;
  if vehicle ? 'mileageKm' and vehicle->'mileageKm'<>'null'::jsonb and
    (jsonb_typeof(vehicle->'mileageKm')<>'number' or (vehicle->>'mileageKm') !~ '^[0-9]{1,10}$') then
    raise exception 'Invalid mileage' using errcode='22023'; end if;
  plate := upper(btrim(vehicle->>'registrationPlate'));
  vehicle_make := btrim(vehicle->>'make'); vehicle_model := btrim(vehicle->>'model');
  vehicle_year := (vehicle->>'year')::integer; vehicle_color := btrim(vehicle->>'color');
  vehicle_mileage := (vehicle->>'mileageKm')::integer;
  if plate !~ '^[A-Z0-9][A-Z0-9 -]{1,19}$' or length(vehicle_make) not between 1 and 80
    or length(vehicle_model) not between 1 and 80 or vehicle_year not between 1886 and 9999
    or (vehicle_color is not null and length(vehicle_color) not between 1 and 40) then
    raise exception 'Invalid vehicle details' using errcode='22023'; end if;
  canonical := jsonb_build_object('shopId',target_shop,'slotId',target_slot,'serviceIds',to_jsonb(services),
    'symptomNotes',notes,'vehicle',jsonb_build_object('registrationPlate',plate,'make',vehicle_make,
      'model',vehicle_model,'year',vehicle_year,'color',vehicle_color,'mileageKm',vehicle_mileage));
  select * into receipt from private.booking_receipts
    where customer_id=actor and idempotency_key=request_key;
  if found then
    if receipt.payload <> canonical then
      raise exception 'Idempotency payload conflict' using errcode='BF002'; end if;
    select * into b from public.bookings where id=receipt.booking_id and customer_id=actor;
    if not found then raise exception 'Receipt invariant failed' using errcode='XX000'; end if;
    return jsonb_build_object('booking',private.booking_creation_dto(b),'replayed',true);
  end if;
  -- Match B04's shop -> slot lock order. A shared shop lock freezes publication,
  -- hours, services and team changes without serializing different customers.
  select * into s from public.shops where id=target_shop for share;
  if not found or not s.active then raise exception 'Shop unavailable' using errcode='P0002'; end if;
  select * into a from public.appointment_slots where id=target_slot and shop_id=s.id for update;
  if not found then raise exception 'Appointment not found' using errcode='P0002'; end if;
  instant := clock_timestamp();
  if a.starts_at<=instant or (a.starts_at at time zone s.timezone)::date not between
      (instant at time zone s.timezone)::date and (instant at time zone s.timezone)::date+13
    or a.capacity<>s.slot_capacity
    or not exists(select 1 from private.shop_slot_grid(s.working_hours,s.timezone,s.slot_duration_minutes,
      (instant at time zone s.timezone)::date) g where g.starts_at=a.starts_at and g.ends_at=a.ends_at) then
    raise exception 'Appointment no longer available' using errcode='BF001'; end if;
  if (select count(*) from public.bookings where shop_id=s.id and slot_id=a.id and status<>'CANCELLED') >= a.capacity then
    raise exception 'Appointment full' using errcode='BF001'; end if;
  if (select count(*) from public.services catalog where catalog.shop_id=s.id and catalog.id=any(services) and catalog.active) <> cardinality(services) then
    raise exception 'Service unavailable' using errcode='22023'; end if;
  select * into v from public.vehicles where customer_id=actor and upper(btrim(registration_plate))=plate
    order by created_at,id limit 1 for update;
  if found then
    if (v.make,v.model,v.year,v.color,v.mileage) is distinct from
      (vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_mileage) then
      raise exception 'Existing vehicle details differ' using errcode='BF003'; end if;
  else
    perform private.sync_profile_impl();
    insert into public.vehicles(customer_id,registration_plate,make,model,year,color,mileage)
      values(actor,plate,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_mileage) returning * into v;
  end if;
  insert into public.bookings(shop_id,customer_id,vehicle_id,slot_id,status,notes)
    values(s.id,actor,v.id,a.id,'PENDING',notes) returning * into b;
  insert into public.booking_services(shop_id,booking_id,service_id) select s.id,b.id,unnest(services);
  insert into public.booking_history(shop_id,booking_id,actor_user_id,from_status,to_status,action,note)
    values(s.id,b.id,actor,null,'PENDING','CREATE_BOOKING',nullif(notes,''));
  insert into public.notifications(user_id,shop_id,booking_id,type,title,message)
    select m.user_id,s.id,b.id,'NEW_BOOKING','New booking','A customer appointment is awaiting confirmation.'
    from public.shop_memberships m where m.shop_id=s.id and m.role='SA' and m.active;
  insert into private.booking_receipts(customer_id,idempotency_key,payload,booking_id)
    values(actor,request_key,canonical,b.id);
  return jsonb_build_object('booking',private.booking_creation_dto(b),'replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid booking input' using errcode='22023';
end;
$$;

create function public.create_booking(input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_booking_impl(input);
$$;
revoke all on function private.booking_creation_dto(public.bookings),private.create_booking_impl(jsonb),
  public.create_booking(jsonb) from public,anon,authenticated;
grant execute on function private.create_booking_impl(jsonb),public.create_booking(jsonb) to authenticated;

commit;
