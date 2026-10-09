begin;
alter table private.booking_action_receipts drop constraint booking_action_receipts_action_check;
alter table private.booking_action_receipts add constraint booking_action_receipts_action_check check (action in (
  'CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION','CANCEL_BOOKING',
  'SUBMIT_ESTIMATE','SEND_ESTIMATE','APPROVE_ESTIMATE','REJECT_ESTIMATE','REVISE_ESTIMATE',
  'ASSIGN_PARTS','MARK_PARTS_READY','ORDER_PARTS','RECEIVE_PARTS','ALLOCATE_PARTS'));
-- Payload canonicalization happens before actor-scoped replay comparison.
create function private.normalize_parts_payload(action_name text, payload jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  allowed text[]; key text; item jsonb; part_uuid uuid; quantity_value integer;
  items jsonb := '[]'; supplier text;
begin
  allowed := case action_name
    when 'ASSIGN_PARTS' then array['partsUserId']
    when 'ORDER_PARTS' then array['items','supplierName']
    when 'RECEIVE_PARTS' then array['purchaseOrderId','items']
    else array[]::text[] end;
  for key in select jsonb_object_keys(payload) loop
    if key <> all(allowed) then raise exception 'Unsupported parts field' using errcode='22023'; end if;
  end loop;
  if action_name = 'ASSIGN_PARTS' then
    if jsonb_typeof(payload->'partsUserId') is distinct from 'string'
      or not coalesce((payload->>'partsUserId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) then
      raise exception 'Parts person required' using errcode='22023'; end if;
    return jsonb_build_object('partsUserId', (payload->>'partsUserId')::uuid);
  elsif action_name in ('MARK_PARTS_READY','ALLOCATE_PARTS') then
    return '{}'::jsonb;
  end if;
  if action_name = 'RECEIVE_PARTS' then
    if jsonb_typeof(payload->'purchaseOrderId') is distinct from 'string'
      or not coalesce((payload->>'purchaseOrderId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) then
      raise exception 'Purchase order required' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception 'Parts items required' using errcode='22023'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 100 then
    raise exception 'Parts items required' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
    if jsonb_typeof(item) <> 'object' then raise exception 'Item object required' using errcode='22023'; end if;
    for key in select jsonb_object_keys(item) loop
      if key <> all(array['partId','quantity']) then raise exception 'Unsupported item field' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(item->'partId') is distinct from 'string'
      or not coalesce((item->>'partId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or not coalesce((item->>'quantity') ~ '^[0-9]{1,9}$', false) then
      raise exception 'Part and positive quantity required' using errcode='22023'; end if;
    part_uuid := (item->>'partId')::uuid; quantity_value := (item->>'quantity')::integer;
    if quantity_value < 1 or exists (select 1 from jsonb_array_elements(items) i where (i->>'partId')::uuid=part_uuid) then
      raise exception 'Positive quantities and distinct parts required' using errcode='22023'; end if;
    items := items || jsonb_build_array(jsonb_build_object('partId', part_uuid, 'quantity', quantity_value));
  end loop;
  select jsonb_agg(value order by value->>'partId') into items from jsonb_array_elements(items);
  if action_name = 'RECEIVE_PARTS' then
    return jsonb_build_object('purchaseOrderId', (payload->>'purchaseOrderId')::uuid, 'items', items);
  end if;
  if payload ? 'supplierName' and payload->'supplierName' <> 'null'::jsonb then
    if jsonb_typeof(payload->'supplierName') <> 'string' then raise exception 'Supplier must be text' using errcode='22023'; end if;
    supplier := nullif(btrim(payload->>'supplierName'), '');
    if length(supplier) > 200 then raise exception 'Supplier too long' using errcode='22023'; end if;
  end if;
  return jsonb_build_object('supplierName', supplier, 'items', items);
end;
$$;

create function private.approved_part_requirements(b public.bookings)
returns table(part_id uuid, quantity bigint) language sql stable set search_path = '' as $$
  select i.part_id, sum(i.quantity)::bigint
  from public.estimate_items i join public.estimates e on e.id=i.estimate_id and e.shop_id=i.shop_id
  where e.booking_id=b.id and e.shop_id=b.shop_id and e.state='APPROVED'
    and e.revision_no=(select max(x.revision_no) from public.estimates x where x.booking_id=b.id and x.shop_id=b.shop_id)
    and i.kind='PART'
  group by i.part_id;
$$;

create function private.required_parts_dto(b public.bookings)
returns jsonb language sql stable set search_path = '' as $$
  select case when private.active_shop_role(b.shop_id, auth.uid(), array['OWNER','SA','PARTS','TECHNICIAN']::public.shop_role[])
    then coalesce((select jsonb_agg(jsonb_build_object('partId', r.part_id,
      'quantityRequired', r.quantity, 'quantityOnHand', p.quantity_on_hand,
      'quantityAllocated', coalesce(a.quantity,0),
      'shortageQuantity', greatest(0, r.quantity - p.quantity_on_hand - coalesce(a.quantity,0))) order by r.part_id)
      from private.approved_part_requirements(b) r join public.inventory_parts p on p.id=r.part_id and p.shop_id=b.shop_id
      left join (select part_id, sum(quantity) quantity from public.part_allocations where booking_id=b.id and released_at is null group by part_id) a on a.part_id=r.part_id), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

create function private.purchase_orders_dto(b public.bookings)
returns jsonb language sql stable set search_path = '' as $$
  select case when private.active_shop_role(b.shop_id, auth.uid(), array['OWNER','PARTS']::public.shop_role[])
    then coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'shopId', o.shop_id, 'bookingId', o.booking_id,
      'createdBy', o.created_by, 'status', o.status, 'supplierName', o.supplier_name,
      'orderedAt', o.ordered_at, 'receivedAt', o.received_at, 'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'partId', i.part_id,
          'quantityOrdered', i.quantity_ordered, 'quantityReceived', i.quantity_received) order by i.part_id)
        from public.purchase_order_items i where i.purchase_order_id=o.id and i.shop_id=o.shop_id), '[]'::jsonb)) order by o.ordered_at, o.id)
      from public.purchase_orders o where o.booking_id=b.id and o.shop_id=b.shop_id), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

create function private.release_pre_repair_parts(b public.bookings)
returns void language plpgsql set search_path = '' as $$
declare a public.part_allocations;
begin
  if exists (select 1 from public.booking_history h where h.booking_id=b.id and h.to_status='IN_REPAIR') then
    raise exception 'Cancellation no longer allowed' using errcode='BF103'; end if;
  perform p.id from public.inventory_parts p where p.shop_id=b.shop_id and p.id in (
    select part_id from public.part_allocations where booking_id=b.id and released_at is null
  ) order by p.id for update;
  for a in select * from public.part_allocations where booking_id=b.id and shop_id=b.shop_id and released_at is null for update loop
    update public.inventory_parts set quantity_on_hand=quantity_on_hand+a.quantity where id=a.part_id and shop_id=b.shop_id;
    update public.part_allocations set released_at=clock_timestamp() where id=a.id;
  end loop;
end;
$$;

create function private.execute_parts_action(b public.bookings, actor uuid, action_name text, payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  target_parts uuid; next_status public.booking_status := b.status; item jsonb; required_quantity bigint;
  stock integer; outstanding bigint; order_id uuid; po public.purchase_orders; line public.purchase_order_items;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Retry with read committed isolation' using errcode='40001'; end if;
  -- B03 membership changes cannot revoke authority midway through this transaction.
  perform 1 from public.shop_memberships where shop_id=b.shop_id and user_id=actor for share;
  if action_name = 'ASSIGN_PARTS' then
    if b.status <> 'ESTIMATE_APPROVED' then raise exception 'Action not allowed' using errcode='BF103'; end if;
    if not private.active_shop_role(b.shop_id, actor, array['OWNER','SA']::public.shop_role[]) then
      raise exception 'Action forbidden' using errcode='42501'; end if;
    target_parts := (payload->>'partsUserId')::uuid;
    perform 1 from public.shop_memberships where shop_id=b.shop_id and user_id=target_parts for share;
    if not private.active_shop_member(b.shop_id, target_parts, 'PARTS') then
      raise exception 'Parts person not found' using errcode='P0002'; end if;
  else
    if b.parts_user_id is distinct from actor or not private.active_shop_member(b.shop_id, actor, 'PARTS') then
      raise exception 'Action forbidden' using errcode='42501'; end if;
    if (action_name='MARK_PARTS_READY' and b.status not in ('PARTS_PENDING','PARTS_ORDERED'))
      or (action_name='ORDER_PARTS' and b.status not in ('PARTS_PENDING','PARTS_ORDERED','PARTS_READY'))
      or (action_name='RECEIVE_PARTS' and b.status not in ('PARTS_ORDERED','PARTS_READY'))
      or (action_name='ALLOCATE_PARTS' and b.status <> 'PARTS_READY') then
      raise exception 'Action not allowed' using errcode='BF103'; end if;
  end if;
  if not exists (select 1 from public.estimates e where e.booking_id=b.id and e.shop_id=b.shop_id and e.state='APPROVED'
    and e.revision_no=(select max(x.revision_no) from public.estimates x where x.booking_id=b.id and x.shop_id=b.shop_id)) then
    raise exception 'Approved estimate required' using errcode='BF103'; end if;
  if exists (select 1 from private.approved_part_requirements(b) r where r.quantity > 2147483647) then
    raise exception 'Required part quantity too large' using errcode='22023'; end if;
  if action_name = 'ASSIGN_PARTS' then
    update public.bookings set parts_user_id=target_parts, status='PARTS_PENDING', state_version=state_version+1 where id=b.id;
    insert into public.notifications(user_id,shop_id,booking_id,type,title,message)
      values(target_parts,b.shop_id,b.id,'PARTS_ASSIGNED','Parts job assigned','An approved estimate is ready for parts preparation.');
    return '{}'::jsonb;
  end if;
  -- Sorted inventory locks serialize competing jobs; READY is advisory, not a reservation.
  perform p.id from public.inventory_parts p join private.approved_part_requirements(b) r on r.part_id=p.id
    where p.shop_id=b.shop_id order by p.id for update of p;
  if action_name = 'ORDER_PARTS' then
    for item in select value from jsonb_array_elements(payload->'items') loop
      select r.quantity, p.quantity_on_hand into required_quantity, stock
        from private.approved_part_requirements(b) r join public.inventory_parts p on p.id=r.part_id and p.shop_id=b.shop_id
        where r.part_id=(item->>'partId')::uuid;
      if not found then raise exception 'Required part not found' using errcode='P0002'; end if;
      select coalesce(sum(i.quantity_ordered-i.quantity_received),0) into outstanding
        from public.purchase_order_items i join public.purchase_orders o on o.id=i.purchase_order_id and o.shop_id=i.shop_id
        where o.booking_id=b.id and o.shop_id=b.shop_id and i.part_id=(item->>'partId')::uuid;
      if (item->>'quantity')::integer > greatest(0,required_quantity-stock-outstanding) then
        raise exception 'Order exceeds uncovered shortage' using errcode='BF103'; end if;
    end loop;
    insert into public.purchase_orders(shop_id,booking_id,created_by,supplier_name)
      values(b.shop_id,b.id,actor,payload->>'supplierName') returning id into order_id;
    insert into public.purchase_order_items(shop_id,purchase_order_id,part_id,quantity_ordered)
      select b.shop_id,order_id,(i->>'partId')::uuid,(i->>'quantity')::integer from jsonb_array_elements(payload->'items') i;
    next_status := case when b.status='PARTS_READY' then b.status else 'PARTS_ORDERED'::public.booking_status end;
  elsif action_name = 'RECEIVE_PARTS' then
    order_id := (payload->>'purchaseOrderId')::uuid;
    select * into po from public.purchase_orders where id=order_id and shop_id=b.shop_id and booking_id=b.id for update;
    if not found then raise exception 'Purchase order not found' using errcode='P0002'; end if;
    for item in select value from jsonb_array_elements(payload->'items') loop
      select * into line from public.purchase_order_items where purchase_order_id=po.id and shop_id=b.shop_id
        and part_id=(item->>'partId')::uuid for update;
      if not found then raise exception 'Order item not found' using errcode='P0002'; end if;
      if (item->>'quantity')::integer > line.quantity_ordered-line.quantity_received then
        raise exception 'Receipt exceeds remaining order quantity' using errcode='BF103'; end if;
      update public.purchase_order_items set quantity_received=quantity_received+(item->>'quantity')::integer where id=line.id;
      update public.inventory_parts set quantity_on_hand=quantity_on_hand+(item->>'quantity')::integer where id=line.part_id and shop_id=b.shop_id;
    end loop;
    if not exists (select 1 from public.purchase_order_items where purchase_order_id=po.id and quantity_received<quantity_ordered) then
      update public.purchase_orders set status='RECEIVED',received_at=clock_timestamp() where id=po.id;
    else
      update public.purchase_orders set status='PARTIALLY_RECEIVED' where id=po.id;
    end if;
    if not exists (select 1 from private.approved_part_requirements(b) r join public.inventory_parts p on p.id=r.part_id and p.shop_id=b.shop_id
      where p.quantity_on_hand<r.quantity) then next_status := 'PARTS_READY'; end if;
  elsif action_name in ('MARK_PARTS_READY','ALLOCATE_PARTS') then
    if exists (select 1 from private.approved_part_requirements(b) r join public.inventory_parts p on p.id=r.part_id and p.shop_id=b.shop_id
      where p.quantity_on_hand<r.quantity) then raise exception 'Insufficient stock' using errcode='BF104'; end if;
    if action_name = 'MARK_PARTS_READY' then next_status := 'PARTS_READY';
    else
      if exists (select 1 from public.part_allocations where booking_id=b.id and released_at is null) then
        raise exception 'Parts already allocated' using errcode='BF103'; end if;
      insert into public.part_allocations(shop_id,booking_id,part_id,quantity,allocated_by)
        select b.shop_id,b.id,r.part_id,r.quantity::integer,actor from private.approved_part_requirements(b) r;
      update public.inventory_parts p set quantity_on_hand=p.quantity_on_hand-r.quantity::integer
        from private.approved_part_requirements(b) r where p.id=r.part_id and p.shop_id=b.shop_id;
      next_status := 'IN_REPAIR';
    end if;
  end if;
  update public.bookings set status=next_status, state_version=state_version+case when status<>next_status then 1 else 0 end where id=b.id;
  if action_name='ORDER_PARTS' or next_status<>b.status then
    insert into public.notifications(user_id,shop_id,booking_id,type,title,message)
      select recipient,b.shop_id,b.id,action_name,'Parts workflow updated',
        case when next_status='IN_REPAIR' then 'Parts have been allocated. Repair can begin.'
          when next_status='PARTS_READY' then 'Required parts are available for allocation.' else 'Missing parts have been ordered.' end
      from (select b.parts_user_id recipient union select b.technician_user_id) recipients where recipient is not null;
  end if;
  return jsonb_build_object('purchaseOrderId',order_id);
end;
$$;

revoke all on function private.normalize_parts_payload(text,jsonb), private.approved_part_requirements(public.bookings),
  private.required_parts_dto(public.bookings), private.purchase_orders_dto(public.bookings),
  private.release_pre_repair_parts(public.bookings), private.execute_parts_action(public.bookings,uuid,text,jsonb)
  from public,anon,authenticated;

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
    'requiredParts', private.required_parts_dto(b),
    'purchaseOrders', private.purchase_orders_dto(b),
    'partAllocations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'partId', a.part_id, 'quantity', a.quantity, 'allocatedBy', a.allocated_by,
      'allocatedAt', a.allocated_at, 'releasedAt', a.released_at) order by a.allocated_at, a.id)
      from public.part_allocations a where a.booking_id = b.id and a.shop_id = b.shop_id), '[]'::jsonb),
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
  target_technician uuid; reason text; is_sa boolean; latest_estimate public.estimates;
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
      'SUBMIT_ESTIMATE','SEND_ESTIMATE','APPROVE_ESTIMATE','REJECT_ESTIMATE','REVISE_ESTIMATE',
      'ASSIGN_PARTS','MARK_PARTS_READY','ORDER_PARTS','RECEIVE_PARTS','ALLOCATE_PARTS'
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

  if action_name in ('ASSIGN_PARTS','MARK_PARTS_READY','ORDER_PARTS','RECEIVE_PARTS','ALLOCATE_PARTS') then
    payload := private.normalize_parts_payload(action_name, payload);
  elsif action_name = 'ASSIGN_TECHNICIAN' then
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

  if action_name in ('ASSIGN_PARTS','MARK_PARTS_READY','ORDER_PARTS','RECEIVE_PARTS','ALLOCATE_PARTS') then
    perform private.execute_parts_action(b, actor, action_name, payload);
    select * into b from public.bookings where id = b.id;
    next_status := b.status;
  elsif action_name = 'CONFIRM_BOOKING' then
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
    perform private.release_pre_repair_parts(b);
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


create function private.inventory_part_dto(p public.inventory_parts)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',p.id,'shopId',p.shop_id,'sku',p.sku,'name',p.name,
    'quantityOnHand',p.quantity_on_hand,'reorderLevel',p.reorder_level,'unitCostPkr',p.unit_cost_pkr,'active',p.active);
$$;

create function private.save_inventory_part_impl(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); target_shop uuid; target_part uuid; key text;
  p public.inventory_parts; sku_text text; name_text text; cost integer; reorder integer; opening integer;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform 1 from auth.users where id=actor for update;
  if not found then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input)<>'object' then raise exception 'Inventory input required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['shopId','id','sku','name','quantityOnHand','reorderLevel','unitCostPkr','active']) then
      raise exception 'Unsupported inventory field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(input->'shopId') is distinct from 'string'
    or not coalesce((input->>'shopId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then
    raise exception 'Shop required' using errcode='22023'; end if;
  target_shop := (input->>'shopId')::uuid;
  perform 1 from public.shop_memberships where shop_id=target_shop and user_id=actor for share;
  if not private.active_shop_role(target_shop,actor,array['OWNER','PARTS']::public.shop_role[]) then
    raise exception 'Inventory forbidden' using errcode='42501'; end if;
  if input ? 'id' then
    if jsonb_typeof(input->'id') is distinct from 'string'
      or not coalesce((input->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then
      raise exception 'Part required' using errcode='22023'; end if;
    target_part := (input->>'id')::uuid;
    select * into p from public.inventory_parts where id=target_part and shop_id=target_shop for update;
    if not found then raise exception 'Part not found' using errcode='P0002'; end if;
    if input ? 'quantityOnHand' then raise exception 'Stock cannot be overwritten' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(input->'sku') is distinct from 'string' or jsonb_typeof(input->'name') is distinct from 'string' then
    raise exception 'SKU and name required' using errcode='22023'; end if;
  sku_text := btrim(input->>'sku'); name_text := btrim(input->>'name');
  if length(sku_text) not between 1 and 80 or length(name_text) not between 1 and 200 then
    raise exception 'SKU and name required' using errcode='22023'; end if;
  foreach key in array array['unitCostPkr','reorderLevel','quantityOnHand'] loop
    if (key='unitCostPkr' or input ? key) and (jsonb_typeof(input->key) is distinct from 'number'
      or not coalesce((input->>key) ~ '^[0-9]{1,9}$',false)) then
      raise exception 'Nonnegative integer required' using errcode='22023'; end if;
  end loop;
  if input ? 'active' and jsonb_typeof(input->'active')<>'boolean' then raise exception 'Active must be boolean' using errcode='22023'; end if;
  cost := (input->>'unitCostPkr')::integer;
  reorder := coalesce((input->>'reorderLevel')::integer,0);
  opening := coalesce((input->>'quantityOnHand')::integer,0);
  if target_part is null then
    insert into public.inventory_parts(shop_id,sku,name,quantity_on_hand,reorder_level,unit_cost_pkr,active)
      values(target_shop,sku_text,name_text,opening,reorder,cost,coalesce((input->>'active')::boolean,true)) returning * into p;
  else
    update public.inventory_parts set sku=sku_text,name=name_text,reorder_level=reorder,unit_cost_pkr=cost,
      active=coalesce((input->>'active')::boolean,p.active) where id=p.id returning * into p;
  end if;
  return private.inventory_part_dto(p);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid inventory input' using errcode='22023';
end;
$$;

create function private.list_inventory_impl(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_shop uuid; page_number integer; key text; items jsonb; total bigint;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if input is null or jsonb_typeof(input)<>'object' then raise exception 'Inventory input required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(input) loop
    if key <> all(array['shopId','page']) then raise exception 'Unsupported inventory field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(input->'shopId') is distinct from 'string'
    or not coalesce((input->>'shopId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then
    raise exception 'Shop required' using errcode='22023'; end if;
  target_shop := (input->>'shopId')::uuid;
  if not private.active_shop_role(target_shop,actor,array['OWNER','PARTS']::public.shop_role[]) then
    raise exception 'Inventory forbidden' using errcode='42501'; end if;
  if input ? 'page' and (jsonb_typeof(input->'page')<>'number' or not coalesce((input->>'page') ~ '^[0-9]{1,5}$',false)) then
    raise exception 'Page required' using errcode='22023'; end if;
  page_number := coalesce((input->>'page')::integer,1);
  if page_number not between 1 and 99999 then raise exception 'Page required' using errcode='22023'; end if;
  select count(*) into total from public.inventory_parts where shop_id=target_shop;
  select coalesce(jsonb_agg(private.inventory_part_dto(p) order by p.sku,p.id),'[]'::jsonb) into items
    from (select * from public.inventory_parts where shop_id=target_shop order by sku,id limit 50 offset (page_number-1)*50) p;
  return jsonb_build_object('items',items,'page',page_number,'pageSize',50,'total',total);
end;
$$;

create function public.save_inventory_part(input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select private.save_inventory_part_impl(input); $$;
create function public.list_inventory(input jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.list_inventory_impl(input); $$;
revoke all on function private.inventory_part_dto(public.inventory_parts), private.save_inventory_part_impl(jsonb),
  private.list_inventory_impl(jsonb), public.save_inventory_part(jsonb), public.list_inventory(jsonb) from public,anon,authenticated;
grant execute on function private.save_inventory_part_impl(jsonb), private.list_inventory_impl(jsonb),
  public.save_inventory_part(jsonb), public.list_inventory(jsonb) to authenticated;

commit;
