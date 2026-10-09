begin;

alter table private.booking_action_receipts drop constraint booking_action_receipts_action_check;
alter table private.booking_action_receipts add constraint booking_action_receipts_action_check
  check (action in (
    'CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION','CANCEL_BOOKING',
    'SUBMIT_ESTIMATE','SEND_ESTIMATE','APPROVE_ESTIMATE','REJECT_ESTIMATE','REVISE_ESTIMATE'
  ));

create or replace function private.normalize_estimate_payload(target_shop uuid, payload jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  key text; item jsonb; item_key text; normalized_items jsonb := '[]'::jsonb;
  diagnosis text; kind text; description_text text; part_text text; part_uuid uuid;
  quantity_value integer; unit_price_value integer; subtotal bigint := 0; line_total bigint; item_count integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Estimate payload required' using errcode='22023';
  end if;
  for key in select jsonb_object_keys(payload) loop
    if key <> all(array['diagnosisNote','items']) then
      raise exception 'Unsupported estimate field' using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(payload->'diagnosisNote') is distinct from 'string' then
    raise exception 'Diagnosis note required' using errcode='22023';
  end if;
  diagnosis := btrim(payload->>'diagnosisNote');
  if length(diagnosis) not between 3 and 4000 then
    raise exception 'Diagnosis note required' using errcode='22023';
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array'
    or jsonb_array_length(payload->'items') not between 1 and 100 then
    raise exception 'Estimate items required' using errcode='22023';
  end if;

  for item in select value from jsonb_array_elements(payload->'items') loop
    item_count := item_count + 1;
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Estimate item object required' using errcode='22023';
    end if;
    for item_key in select jsonb_object_keys(item) loop
      if item_key <> all(array['kind','partId','descriptionSnapshot','quantity','unitPricePkr']) then
        raise exception 'Unsupported estimate item field' using errcode='22023';
      end if;
    end loop;
    if jsonb_typeof(item->'kind') is distinct from 'string'
      or (item->>'kind') <> all(array['PART','LABOUR']) then
      raise exception 'Estimate item kind required' using errcode='22023';
    end if;
    kind := item->>'kind';
    if jsonb_typeof(item->'descriptionSnapshot') is distinct from 'string' then
      raise exception 'Estimate item description required' using errcode='22023';
    end if;
    description_text := btrim(item->>'descriptionSnapshot');
    if length(description_text) not between 1 and 500 then
      raise exception 'Estimate item description required' using errcode='22023';
    end if;
    if jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity') !~ '^[0-9]{1,9}$' then
      raise exception 'Estimate item quantity required' using errcode='22023';
    end if;
    quantity_value := (item->>'quantity')::integer;
    if quantity_value < 1 then
      raise exception 'Estimate item quantity required' using errcode='22023';
    end if;
    if jsonb_typeof(item->'unitPricePkr') is distinct from 'number' or (item->>'unitPricePkr') !~ '^[0-9]{1,9}$' then
      raise exception 'Estimate item price required' using errcode='22023';
    end if;
    unit_price_value := (item->>'unitPricePkr')::integer;
    part_uuid := null;
    if kind = 'PART' then
      if jsonb_typeof(item->'partId') is distinct from 'string'
        or (item->>'partId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Estimate part required' using errcode='22023';
      end if;
      part_uuid := (item->>'partId')::uuid;
      if target_shop is not null and not exists (select 1 from public.inventory_parts p where p.shop_id = target_shop and p.id = part_uuid) then
        raise exception 'Estimate part not found' using errcode='P0002';
      end if;
    elsif item ? 'partId' and item->'partId' <> 'null'::jsonb then
      raise exception 'Labour estimate item cannot reference a part' using errcode='22023';
    end if;
    line_total := quantity_value::bigint * unit_price_value::bigint;
    subtotal := subtotal + line_total;
    if subtotal > 2147483647 then
      raise exception 'Estimate total is too large' using errcode='22023';
    end if;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'kind', kind,
      'partId', part_uuid,
      'descriptionSnapshot', description_text,
      'quantity', quantity_value,
      'unitPricePkr', unit_price_value,
      'lineTotalPkr', line_total::integer
    ));
  end loop;

  return jsonb_build_object('diagnosisNote', diagnosis, 'items', normalized_items, 'subtotalPkr', subtotal::integer);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid estimate input' using errcode='22023';
end;
$$;
revoke all on function private.normalize_estimate_payload(uuid,jsonb) from public, anon, authenticated;

create or replace function private.write_estimate_items(target_estimate uuid, target_shop uuid, items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  delete from public.estimate_items where estimate_id = target_estimate and shop_id = target_shop;
  for item in select value from jsonb_array_elements(items) loop
    insert into public.estimate_items(shop_id, estimate_id, kind, part_id, description_snapshot, quantity, unit_price_pkr)
      values(target_shop, target_estimate, (item->>'kind')::public.estimate_item_kind, nullif(item->>'partId','')::uuid,
        item->>'descriptionSnapshot', (item->>'quantity')::integer, (item->>'unitPricePkr')::integer);
  end loop;
end;
$$;
revoke all on function private.write_estimate_items(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function private.booking_action_dto(b public.bookings)
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
    'estimates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'bookingId', e.booking_id,
        'shopId', e.shop_id,
        'revisionNo', e.revision_no,
        'state', e.state,
        'diagnosisNote', e.diagnosis_note,
        'subtotalPkr', e.subtotal_pkr,
        'sentAt', e.sent_at,
        'decidedAt', e.decided_at,
        'createdAt', e.created_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id,
            'kind', i.kind,
            'partId', i.part_id,
            'descriptionSnapshot', i.description_snapshot,
            'quantity', i.quantity,
            'unitPricePkr', i.unit_price_pkr,
            'lineTotalPkr', i.line_total_pkr
          ) order by i.created_at, i.id)
          from public.estimate_items i where i.estimate_id = e.id and i.shop_id = e.shop_id
        ), '[]'::jsonb)
      ) order by e.revision_no)
      from public.estimates e
      where e.booking_id = b.id and e.shop_id = b.shop_id
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
revoke all on function private.booking_action_dto(public.bookings) from public, anon, authenticated;

create or replace function private.apply_booking_action_impl(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); target_booking uuid; request_key uuid; action_name text;
  expected_version integer; payload jsonb; canonical jsonb; key text; b public.bookings;
  before_status public.booking_status; next_status public.booking_status; receipt private.booking_action_receipts;
  target_technician uuid; reason text; is_sa boolean; latest_estimate public.estimates; estimate_payload jsonb;
  new_estimate_id uuid; next_revision integer;
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
    or (input->>'action') <> all(array[
      'CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION','CANCEL_BOOKING',
      'SUBMIT_ESTIMATE','SEND_ESTIMATE','APPROVE_ESTIMATE','REJECT_ESTIMATE','REVISE_ESTIMATE'
    ]) then
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
    if not coalesce((payload->>'technicianUserId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) then
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
  elsif action_name in ('SUBMIT_ESTIMATE','SEND_ESTIMATE','REVISE_ESTIMATE') then
    payload := private.normalize_estimate_payload(null, payload);
  elsif action_name = 'REJECT_ESTIMATE' then
    for key in select jsonb_object_keys(payload) loop
      if key <> 'reason' then raise exception 'Unsupported rejection field' using errcode='22023'; end if;
    end loop;
    if payload ? 'reason' then
      if jsonb_typeof(payload->'reason') is distinct from 'string' then
        raise exception 'Rejection reason must be text' using errcode='22023'; end if;
      reason := nullif(btrim(payload->>'reason'), '');
      if reason is not null and length(reason) > 500 then
        raise exception 'Rejection reason is too long' using errcode='22023'; end if;
      payload := case when reason is null then '{}'::jsonb else jsonb_build_object('reason', reason) end;
    else
      payload := '{}'::jsonb;
    end if;
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
  if action_name in ('SUBMIT_ESTIMATE','SEND_ESTIMATE','REVISE_ESTIMATE') and exists (
    select 1 from jsonb_array_elements(payload->'items') estimate_item
    where estimate_item->>'kind' = 'PART' and not exists (
      select 1 from public.inventory_parts p
      where p.shop_id = b.shop_id and p.id = (estimate_item->>'partId')::uuid
    )
  ) then
    raise exception 'Estimate part not found' using errcode='P0002';
  end if;
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
  elsif action_name = 'SUBMIT_ESTIMATE' then
    if b.status <> 'INSPECTING' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if b.technician_user_id is distinct from actor then raise exception 'Action forbidden' using errcode='42501'; end if;
    if exists (select 1 from public.estimates e where e.booking_id = b.id and e.shop_id = b.shop_id) then
      raise exception 'Estimate already exists' using errcode='BF103'; end if;
    insert into public.estimates(shop_id, booking_id, revision_no, state, diagnosis_note, subtotal_pkr)
      values(b.shop_id, b.id, 1, 'REVIEW', payload->>'diagnosisNote', (payload->>'subtotalPkr')::integer)
      returning id into new_estimate_id;
    perform private.write_estimate_items(new_estimate_id, b.shop_id, payload->'items');
    next_status := 'ESTIMATE_REVIEW';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      select m.user_id, b.shop_id, b.id, 'ESTIMATE_READY_FOR_REVIEW', 'Estimate ready for review', 'A technician submitted an estimate.'
      from public.shop_memberships m where m.shop_id = b.shop_id and m.active and m.role = 'SA';
  elsif action_name = 'SEND_ESTIMATE' then
    if b.status <> 'ESTIMATE_REVIEW' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if not is_sa then raise exception 'Action forbidden' using errcode='42501'; end if;
    select * into latest_estimate from public.estimates e where e.booking_id = b.id and e.shop_id = b.shop_id
      order by e.revision_no desc for update limit 1;
    if not found or latest_estimate.state <> 'REVIEW' then raise exception 'Review estimate not found' using errcode='BF103'; end if;
    update public.estimates set diagnosis_note = payload->>'diagnosisNote', subtotal_pkr = (payload->>'subtotalPkr')::integer,
      state = 'SENT', sent_at = clock_timestamp() where id = latest_estimate.id returning * into latest_estimate;
    perform private.write_estimate_items(latest_estimate.id, b.shop_id, payload->'items');
    next_status := 'AWAITING_CUSTOMER';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      values(b.customer_id, b.shop_id, b.id, 'ESTIMATE_SENT', 'Estimate ready', 'Your estimate is ready to review.');
  elsif action_name = 'APPROVE_ESTIMATE' then
    if payload <> '{}'::jsonb then raise exception 'Payload not accepted for this action' using errcode='22023'; end if;
    if b.status <> 'AWAITING_CUSTOMER' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if b.customer_id is distinct from actor then raise exception 'Action forbidden' using errcode='42501'; end if;
    select * into latest_estimate from public.estimates e where e.booking_id = b.id and e.shop_id = b.shop_id
      order by e.revision_no desc for update limit 1;
    if not found or latest_estimate.state <> 'SENT' then raise exception 'Sent estimate not found' using errcode='BF103'; end if;
    update public.estimates set state = 'APPROVED', decided_at = clock_timestamp()
      where id = latest_estimate.id returning * into latest_estimate;
    next_status := 'ESTIMATE_APPROVED';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      select m.user_id, b.shop_id, b.id, 'ESTIMATE_APPROVED', 'Estimate approved', 'A customer approved an estimate.'
      from public.shop_memberships m where m.shop_id = b.shop_id and m.active and m.role = 'SA';
  elsif action_name = 'REJECT_ESTIMATE' then
    if b.status <> 'AWAITING_CUSTOMER' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if b.customer_id is distinct from actor then raise exception 'Action forbidden' using errcode='42501'; end if;
    select * into latest_estimate from public.estimates e where e.booking_id = b.id and e.shop_id = b.shop_id
      order by e.revision_no desc for update limit 1;
    if not found or latest_estimate.state <> 'SENT' then raise exception 'Sent estimate not found' using errcode='BF103'; end if;
    update public.estimates set state = 'REJECTED', decided_at = clock_timestamp()
      where id = latest_estimate.id returning * into latest_estimate;
    next_status := 'ESTIMATE_REJECTED';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      select m.user_id, b.shop_id, b.id, 'ESTIMATE_REJECTED', 'Estimate rejected', 'A customer rejected an estimate.'
      from public.shop_memberships m where m.shop_id = b.shop_id and m.active and m.role = 'SA';
  elsif action_name = 'REVISE_ESTIMATE' then
    if b.status <> 'ESTIMATE_REJECTED' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if not is_sa then raise exception 'Action forbidden' using errcode='42501'; end if;
    select * into latest_estimate from public.estimates e where e.booking_id = b.id and e.shop_id = b.shop_id
      order by e.revision_no desc for update limit 1;
    if not found or latest_estimate.state <> 'REJECTED' then raise exception 'Rejected estimate not found' using errcode='BF103'; end if;
    next_revision := latest_estimate.revision_no + 1;
    insert into public.estimates(shop_id, booking_id, revision_no, state, diagnosis_note, subtotal_pkr)
      values(b.shop_id, b.id, next_revision, 'REVIEW', payload->>'diagnosisNote', (payload->>'subtotalPkr')::integer)
      returning id into new_estimate_id;
    perform private.write_estimate_items(new_estimate_id, b.shop_id, payload->'items');
    next_status := 'ESTIMATE_REVIEW';
    update public.bookings set status = next_status, state_version = state_version + 1
      where id = b.id returning * into b;
    insert into public.notifications(user_id, shop_id, booking_id, type, title, message)
      values(b.customer_id, b.shop_id, b.id, 'ESTIMATE_REVISED', 'Estimate revised', 'A revised estimate is in review.');
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

commit;

