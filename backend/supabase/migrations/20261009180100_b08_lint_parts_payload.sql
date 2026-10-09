begin;

create or replace function private.normalize_parts_payload(action_name text, payload jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  allowed text[]; key text; item jsonb; part_uuid uuid; quantity_value integer;
  items jsonb := '[]'::jsonb; supplier text;
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


create or replace function private.execute_parts_action(b public.bookings, actor uuid, action_name text, payload jsonb)
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
        case when action_name='ORDER_PARTS' then 'Missing parts have been ordered.'
          when next_status='IN_REPAIR' then 'Parts have been allocated. Repair can begin.'
          when next_status='PARTS_READY' then 'Required parts are available for allocation.' else 'Missing parts have been ordered.' end
      from (select b.parts_user_id recipient union select b.technician_user_id) recipients where recipient is not null;
  end if;
  return jsonb_build_object('purchaseOrderId',order_id);
end;
$$;


commit;
