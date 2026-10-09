begin;

create table private.booking_action_receipts (
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  action text not null check (action in ('CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION','CANCEL_BOOKING')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result_version integer not null check (result_version >= 0),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, idempotency_key)
);
alter table private.booking_action_receipts enable row level security;
revoke all on private.booking_action_receipts from public, anon, authenticated;

create function private.can_read_booking_action(b public.bookings, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select actor is not null and (
    b.customer_id = actor
    or exists (
      select 1 from public.shop_memberships m
      where m.shop_id = b.shop_id and m.user_id = actor and m.active
        and (
          m.role in ('OWNER','SA')
          or (m.role = 'TECHNICIAN' and b.technician_user_id = actor)
          or (m.role = 'PARTS' and b.parts_user_id = actor)
          or (m.role = 'QC' and (b.status = 'QC_PENDING' or b.qc_claimed_by = actor))
        )
    )
  );
$$;

create function private.booking_action_dto(b public.bookings)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id,
    'shopId', b.shop_id,
    'customerId', b.customer_id,
    'vehicleId', b.vehicle_id,
    'slotId', b.slot_id,
    'status', b.status,
    'stateVersion', b.state_version,
    'symptomNotes', b.notes,
    'technicianUserId', b.technician_user_id,
    'partsUserId', b.parts_user_id,
    'qcClaimedBy', b.qc_claimed_by,
    'createdAt', b.created_at,
    'completedAt', b.completed_at,
    'serviceIds', coalesce((
      select jsonb_agg(bs.service_id order by bs.service_id)
      from public.booking_services bs
      where bs.booking_id = b.id and bs.shop_id = b.shop_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'actorUserId', h.actor_user_id,
        'fromStatus', h.from_status,
        'toStatus', h.to_status,
        'action', h.action,
        'note', h.note,
        'createdAt', h.created_at
      ) order by h.created_at, h.id)
      from public.booking_history h
      where h.booking_id = b.id and h.shop_id = b.shop_id
    ), '[]'::jsonb)
  );
$$;

create function private.list_booking_dto(b public.bookings)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id,
    'shopId', b.shop_id,
    'customerId', b.customer_id,
    'vehicleId', b.vehicle_id,
    'slotId', b.slot_id,
    'status', b.status,
    'stateVersion', b.state_version,
    'symptomNotes', b.notes,
    'technicianUserId', b.technician_user_id,
    'partsUserId', b.parts_user_id,
    'qcClaimedBy', b.qc_claimed_by,
    'createdAt', b.created_at,
    'completedAt', b.completed_at,
    'serviceIds', coalesce((
      select jsonb_agg(bs.service_id order by bs.service_id)
      from public.booking_services bs
      where bs.booking_id = b.id and bs.shop_id = b.shop_id
    ), '[]'::jsonb)
  );
$$;

create function private.active_shop_role(target_shop uuid, actor uuid, allowed public.shop_role[])
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = target_shop and m.user_id = actor and m.active and m.role = any(allowed)
  );
$$;

create function private.active_shop_member(target_shop uuid, target_user uuid, target_role public.shop_role)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = target_shop and m.user_id = target_user and m.active and m.role = target_role
  );
$$;

create function private.apply_booking_action_impl(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); target_booking uuid; request_key uuid; action_name text;
  expected_version integer; payload jsonb; canonical jsonb; key text; b public.bookings;
  before_status public.booking_status; next_status public.booking_status; receipt private.booking_action_receipts;
  target_technician uuid; reason text; is_sa boolean;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform 1 from auth.users where id = actor for update;
  if not found then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input) <> 'object' then
    raise exception 'Action payload required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['bookingId','action','expectedVersion','payload','idempotencyKey']) then
      raise exception 'Unsupported action field' using errcode='22023'; end if;
  end loop;
  foreach key in array array['bookingId','idempotencyKey'] loop
    if jsonb_typeof(input->key) is distinct from 'string'
      or (input->>key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'UUID required' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(input->'action') is distinct from 'string'
    or (input->>'action') <> all(array['CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION','CANCEL_BOOKING']) then
    raise exception 'Unknown action' using errcode='22023'; end if;
  if jsonb_typeof(input->'expectedVersion') is distinct from 'number'
    or (input->>'expectedVersion') !~ '^[0-9]{1,10}$' then
    raise exception 'Expected version required' using errcode='22023'; end if;
  if input ? 'payload' and jsonb_typeof(input->'payload') <> 'object' then
    raise exception 'Action payload object required' using errcode='22023'; end if;
  target_booking := (input->>'bookingId')::uuid;
  request_key := (input->>'idempotencyKey')::uuid;
  action_name := input->>'action';
  expected_version := (input->>'expectedVersion')::integer;
  payload := coalesce(input->'payload', '{}'::jsonb);

  if action_name = 'ASSIGN_TECHNICIAN' then
    for key in select jsonb_object_keys(payload) loop
      if key <> 'technicianUserId' then raise exception 'Unsupported assignment field' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(payload->'technicianUserId') is distinct from 'string'
      or (payload->>'technicianUserId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Technician required' using errcode='22023'; end if;
    target_technician := (payload->>'technicianUserId')::uuid;
    payload := jsonb_build_object('technicianUserId', target_technician);
  elsif action_name = 'CANCEL_BOOKING' then
    for key in select jsonb_object_keys(payload) loop
      if key <> 'reason' then raise exception 'Unsupported cancellation field' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(payload->'reason') is distinct from 'string' then
      raise exception 'Cancellation reason required' using errcode='22023'; end if;
    reason := btrim(payload->>'reason');
    if length(reason) not between 3 and 500 then
      raise exception 'Cancellation reason required' using errcode='22023'; end if;
    payload := jsonb_build_object('reason', reason);
  elsif payload <> '{}'::jsonb then
    raise exception 'Payload not accepted for this action' using errcode='22023';
  end if;

  canonical := jsonb_build_object('bookingId', target_booking, 'action', action_name,
    'expectedVersion', expected_version, 'payload', payload);
  select * into receipt from private.booking_action_receipts
    where actor_user_id = actor and idempotency_key = request_key;
  if found then
    if receipt.payload <> canonical then
      raise exception 'Idempotency payload conflict' using errcode='BF102'; end if;
    select * into b from public.bookings where id = receipt.booking_id;
    if not found or not private.can_read_booking_action(b, actor) then
      raise exception 'Booking not found' using errcode='P0002'; end if;
    return jsonb_build_object('booking', private.booking_action_dto(b), 'replayed', true);
  end if;

  select * into b from public.bookings where id = target_booking for update;
  if not found or not private.can_read_booking_action(b, actor) then
    raise exception 'Booking not found' using errcode='P0002'; end if;
  if b.state_version <> expected_version then
    raise exception 'State version conflict' using errcode='BF101'; end if;
  if b.status in ('COMPLETED','CANCELLED') then
    raise exception 'Terminal booking' using errcode='BF103'; end if;
  before_status := b.status;
  is_sa := private.active_shop_role(b.shop_id, actor, array['OWNER','SA']::public.shop_role[]);

  if action_name = 'CONFIRM_BOOKING' then
    if b.status <> 'PENDING' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if not is_sa then raise exception 'Action forbidden' using errcode='42501'; end if;
    next_status := 'CONFIRMED';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      values(b.customer_id, b.shop_id, b.id, 'BOOKING_CONFIRMED', 'Booking confirmed', 'Your appointment has been confirmed.');
  elsif action_name = 'ASSIGN_TECHNICIAN' then
    if b.status <> 'CONFIRMED' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if not is_sa then raise exception 'Action forbidden' using errcode='42501'; end if;
    if not private.active_shop_member(b.shop_id, target_technician, 'TECHNICIAN') then
      raise exception 'Technician not found' using errcode='P0002'; end if;
    next_status := 'ASSIGNED';
    update public.bookings set status = next_status, technician_user_id = target_technician,
      state_version = state_version + 1 where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      values(target_technician, b.shop_id, b.id, 'TECHNICIAN_ASSIGNED', 'New assigned job', 'A booking has been assigned to you.');
  elsif action_name = 'START_INSPECTION' then
    if b.status <> 'ASSIGNED' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if b.technician_user_id is distinct from actor then raise exception 'Action forbidden' using errcode='42501'; end if;
    next_status := 'INSPECTING';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
  elsif action_name = 'CANCEL_BOOKING' then
    if b.status = any(array['IN_REPAIR','QC_PENDING','QC_IN_PROGRESS','READY_FOR_PICKUP']::public.booking_status[]) then
      raise exception 'Cancellation no longer allowed' using errcode='BF103'; end if;
    if not (b.customer_id = actor or is_sa) then raise exception 'Action forbidden' using errcode='42501'; end if;
    next_status := 'CANCELLED';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    if actor = b.customer_id then
      insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
        select m.user_id, b.shop_id, b.id, 'BOOKING_CANCELLED', 'Booking cancelled', 'A customer cancelled a booking.'
        from public.shop_memberships m where m.shop_id = b.shop_id and m.active and m.role = 'SA';
    else
      insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
        values(b.customer_id, b.shop_id, b.id, 'BOOKING_CANCELLED', 'Booking cancelled', 'Your booking was cancelled.');
    end if;
  end if;

  insert into public.booking_history(shop_id, booking_id, actor_user_id, from_status, to_status, action, note, created_at)
    values(b.shop_id, b.id, actor, before_status, next_status, action_name, reason, clock_timestamp());
  insert into private.booking_action_receipts(actor_user_id, idempotency_key, booking_id, action, payload, result_version)
    values(actor, request_key, b.id, action_name, canonical, b.state_version);
  return jsonb_build_object('booking', private.booking_action_dto(b), 'replayed', false);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid action input' using errcode='22023';
end;
$$;

create function public.apply_booking_action(input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.apply_booking_action_impl(input);
$$;

create function public.get_booking(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_booking uuid; b public.bookings;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input) <> 'object'
    or jsonb_typeof(input->'bookingId') is distinct from 'string'
    or (input->>'bookingId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Booking ID required' using errcode='22023';
  end if;
  target_booking := (input->>'bookingId')::uuid;
  select * into b from public.bookings where id = target_booking;
  if not found or not private.can_read_booking_action(b, actor) then
    raise exception 'Booking not found' using errcode='P0002';
  end if;
  return private.booking_action_dto(b);
end;
$$;

create function public.list_my_bookings(input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(private.list_booking_dto(b) order by b.created_at desc, b.id desc)
    from public.bookings b where b.customer_id = actor
  ), '[]'::jsonb);
end;
$$;

create function public.list_shop_bookings(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); target_shop uuid; filter_status public.booking_status;
  assignee text; page integer; actor_role public.shop_role;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input) <> 'object'
    or jsonb_typeof(input->'shopId') is distinct from 'string'
    or (input->>'shopId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Shop ID required' using errcode='22023';
  end if;
  target_shop := (input->>'shopId')::uuid;
  if input ? 'status' then
    if jsonb_typeof(input->'status') <> 'string' then raise exception 'Invalid status' using errcode='22023'; end if;
    filter_status := (input->>'status')::public.booking_status;
  end if;
  assignee := coalesce(input->>'assignee', 'all');
  if assignee <> all(array['all','mine','unassigned']) then raise exception 'Invalid assignee' using errcode='22023'; end if;
  page := coalesce((input->>'page')::integer, 1);
  if page < 1 or page > 99999 then raise exception 'Invalid page' using errcode='22023'; end if;
  select m.role into actor_role from public.shop_memberships m
    where m.shop_id = target_shop and m.user_id = actor and m.active
      and m.role in ('OWNER','SA','TECHNICIAN','PARTS','QC')
    order by case m.role when 'OWNER' then 1 when 'SA' then 2 when 'TECHNICIAN' then 3 when 'PARTS' then 4 else 5 end
    limit 1;
  if actor_role is null then raise exception 'Shop not found' using errcode='P0002'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(private.list_booking_dto(b) order by b.created_at desc, b.id desc)
    from (
      select * from public.bookings b
      where b.shop_id = target_shop
        and (filter_status is null or b.status = filter_status)
        and (actor_role in ('OWNER','SA')
          or (actor_role = 'TECHNICIAN' and b.technician_user_id = actor)
          or (actor_role = 'PARTS' and b.parts_user_id = actor)
          or (actor_role = 'QC' and (b.status = 'QC_PENDING' or b.qc_claimed_by = actor)))
        and (assignee = 'all'
          or (assignee = 'mine' and (b.technician_user_id = actor or b.parts_user_id = actor or b.qc_claimed_by = actor))
          or (assignee = 'unassigned' and b.technician_user_id is null and b.parts_user_id is null and b.qc_claimed_by is null))
      order by b.created_at desc, b.id desc
      limit 50 offset (page - 1) * 50
    ) b
  ), '[]'::jsonb), 'page', page, 'pageSize', 50);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid list input' using errcode='22023';
end;
$$;

revoke all on function private.can_read_booking_action(public.bookings, uuid),
  private.booking_action_dto(public.bookings), private.list_booking_dto(public.bookings),
  private.active_shop_role(uuid, uuid, public.shop_role[]), private.active_shop_member(uuid, uuid, public.shop_role),
  private.apply_booking_action_impl(jsonb), public.apply_booking_action(jsonb),
  public.get_booking(jsonb), public.list_my_bookings(jsonb), public.list_shop_bookings(jsonb)
  from public, anon, authenticated;
grant execute on function private.apply_booking_action_impl(jsonb), public.apply_booking_action(jsonb),
  public.get_booking(jsonb), public.list_my_bookings(jsonb), public.list_shop_bookings(jsonb)
  to authenticated;

commit;
