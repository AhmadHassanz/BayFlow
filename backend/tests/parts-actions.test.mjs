import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { asUser, expectSqlState, user, withDatabase } from './helpers.mjs';
import { actionRpc, action, apply, setup, makeApproved } from './parts-fixtures.mjs';

async function stock(db,id) {
  await db.query('reset role');
  return (await db.query('select quantity_on_hand from public.inventory_parts where id=$1',[id])).rows[0].quantity_on_hand;
}
test('B08 stock readiness does not reserve; allocation aggregates repeated estimate lines and deducts exactly once',()=>withDatabase(async db=>{
  const f=await setup(db,{stock:5});
  let r=await apply(db,13,action(f.bookingId,'MARK_PARTS_READY',7));
  assert.equal(r.booking.status,'PARTS_READY'); assert.equal(await stock(db,f.partId),5);
  const allocate=action(f.bookingId,'ALLOCATE_PARTS',8);
  r=await apply(db,13,allocate);
  assert.equal(r.booking.status,'IN_REPAIR'); assert.equal(r.booking.stateVersion,9);
  assert.equal(r.booking.partAllocations.length,2);
  assert.equal(r.booking.partAllocations.find(a=>a.partId===f.partId).quantity,3);
  assert.equal(await stock(db,f.partId),2); assert.equal(await stock(db,f.secondPartId),18);
  assert.equal((await apply(db,13,allocate)).replayed,true);
  assert.equal(await stock(db,f.partId),2);
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ALLOCATE_PARTS',9)],'BF103');
  await asUser(db,3);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'CANCEL_BOOKING',9,{reason:'No longer needed'})],'BF103');
  const detail=(await db.query('select public.get_booking($1) b',[{bookingId:f.bookingId}])).rows[0].b;
  assert.deepEqual(detail.requiredParts,[]); assert.deepEqual(detail.purchaseOrders,[]);
  assert.equal(detail.estimates[0].subtotalPkr,900);
  await db.query('reset role');
  assert.equal((await db.query("select count(*)::integer n from public.booking_history where booking_id=$1 and action='ALLOCATE_PARTS'",[f.bookingId])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::integer n from public.notifications where booking_id=$1 and type='ALLOCATE_PARTS'",[f.bookingId])).rows[0].n,2);
}));
test('B08 PO creation does not increase stock; partial receipts and retries preserve exact deltas and final readiness',()=>withDatabase(async db=>{
  const f=await setup(db);
  const ordered=await apply(db,13,action(f.bookingId,'ORDER_PARTS',7,{supplierName:' Belt supplier ',items:[{partId:f.partId,quantity:3}]}));
  const po=ordered.booking.purchaseOrders[0];
  assert.equal(ordered.booking.status,'PARTS_ORDERED'); assert.equal(po.status,'ORDERED');
  assert.equal(po.supplierName,'Belt supplier'); assert.equal(await stock(db,f.partId),0);
  const receive=action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:1}]});
  let r=await apply(db,13,receive);
  assert.equal(r.booking.status,'PARTS_ORDERED'); assert.equal(r.booking.stateVersion,8);
  assert.equal(r.booking.purchaseOrders[0].status,'PARTIALLY_RECEIVED');
  assert.equal((await apply(db,13,receive)).replayed,true); assert.equal(await stock(db,f.partId),1);
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[{...receive,payload:{...receive.payload,items:[{partId:f.partId,quantity:2}]}}],'BF102');
  await expectSqlState(db,actionRpc,[action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:3}]})],'BF103');
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ORDER_PARTS',8,{items:[{partId:f.partId,quantity:1}]})],'BF103');
  assert.equal(await stock(db,f.partId),1);
  r=await apply(db,13,action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:2}]}));
  assert.equal(r.booking.status,'PARTS_READY'); assert.equal(r.booking.stateVersion,9);
  assert.equal(r.booking.purchaseOrders[0].status,'RECEIVED'); assert.ok(r.booking.purchaseOrders[0].receivedAt);
  assert.equal(r.booking.purchaseOrders[0].items[0].quantityReceived,3);
  r=await apply(db,13,action(f.bookingId,'ALLOCATE_PARTS',9));
  assert.equal(r.booking.status,'IN_REPAIR'); assert.equal(await stock(db,f.partId),0);
}));
test('B08 receipt rolls back every line on overdelivery; foreign orders and unsafe direct RPC payloads fail',()=>withDatabase(async db=>{
  const f=await setup(db);
  await db.query('reset role');
  await db.query('update public.inventory_parts set quantity_on_hand=0 where id=$1',[f.secondPartId]);
  const r=await apply(db,13,action(f.bookingId,'ORDER_PARTS',7,{items:[{partId:f.partId,quantity:3},{partId:f.secondPartId,quantity:2}]}));
  const po=r.booking.purchaseOrders[0];
  await expectSqlState(db,actionRpc,[action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:1},{partId:f.secondPartId,quantity:3}]})],'BF103');
  assert.equal(await stock(db,f.partId),0); assert.equal(await stock(db,f.secondPartId),0);
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:randomUUID(),items:[{partId:f.partId,quantity:1}]})],'P0002');
  for(const payload of [
    {items:[]}, {items:[{partId:f.partId,quantity:0}]}, {items:[{partId:f.partId,quantity:1},{partId:f.partId,quantity:1}]},
    {items:[{partId:f.partId,quantity:1,unitCostPkr:20}]}, {items:[{partId:f.partId,quantity:1}],actorUserId:user(1)},
  ]) await expectSqlState(db,actionRpc,[action(f.bookingId,'ORDER_PARTS',8,payload)],'22023');
  const other=await makeApproved(db,f,{customer:4,partsActor:23});
  await asUser(db,23);
  await expectSqlState(db,actionRpc,[action(other,'RECEIVE_PARTS',7,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:1}]})],'BF103');
  await apply(db,23,action(other,'ORDER_PARTS',7,{items:[{partId:f.partId,quantity:3}]}));
  await expectSqlState(db,actionRpc,[action(other,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:1}]})],'P0002');
}));
test('B08 enforces active same-shop parts assignment, owning job and versions; no blanket owner override',()=>withDatabase(async db=>{
  const f=await setup(db);
  await asUser(db,11);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'MARK_PARTS_READY',7)],'42501');
  await asUser(db,1);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ORDER_PARTS',7,{items:[{partId:f.partId,quantity:3}]})],'42501');
  await asUser(db,23);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'MARK_PARTS_READY',7)],'P0002');
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'MARK_PARTS_READY',6)],'BF101');
  await expectSqlState(db,actionRpc,[action(f.bookingId,'MARK_PARTS_READY',7)],'BF104');
  await db.query('reset role');
  await db.query('update public.bookings set status=$2,state_version=6,parts_user_id=null where id=$1',[f.bookingId,'ESTIMATE_APPROVED']);
  await asUser(db,11);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ASSIGN_PARTS',6,{partsUserId:user(33)})],'P0002');
  await db.query('reset role');
  await db.query('update public.shop_memberships set active=false where shop_id=$1 and user_id=$2',[f.shopId,user(13)]);
  await asUser(db,11);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ASSIGN_PARTS',6,{partsUserId:user(13)})],'P0002');
}));
test('B08 labour-only approved jobs pass readiness and allocation without creating stock allocations',()=>withDatabase(async db=>{
  const f=await setup(db,{labourOnly:true});
  await apply(db,13,action(f.bookingId,'MARK_PARTS_READY',7));
  const r=await apply(db,13,action(f.bookingId,'ALLOCATE_PARTS',8));
  assert.equal(r.booking.status,'IN_REPAIR'); assert.deepEqual(r.booking.partAllocations,[]);
  assert.equal(await stock(db,f.secondPartId),20);
}));
test('B08 pre-repair cancellation releases legacy reservations once and blocks later receipt',()=>withDatabase(async db=>{
  const f=await setup(db,{stock:5});
  await db.query('reset role');
  await db.query('update public.inventory_parts set quantity_on_hand=quantity_on_hand-1 where id=$1',[f.partId]);
  await db.query('insert into public.part_allocations(shop_id,booking_id,part_id,quantity,allocated_by) values($1,$2,$3,1,$4)',[f.shopId,f.bookingId,f.partId,user(13)]);
  const cancel=action(f.bookingId,'CANCEL_BOOKING',7,{reason:'Customer changed plans'});
  const r=await apply(db,3,cancel);
  assert.equal(r.booking.status,'CANCELLED'); assert.ok(r.booking.partAllocations[0].releasedAt);
  assert.equal(await stock(db,f.partId),5);
  assert.equal((await apply(db,3,cancel)).replayed,true); assert.equal(await stock(db,f.partId),5);
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'RECEIVE_PARTS',8,{purchaseOrderId:randomUUID(),items:[{partId:f.partId,quantity:1}]})],'BF103');
}));
test('B08 inventory catalog is owner/parts scoped, paginated and cannot overwrite existing stock',()=>withDatabase(async db=>{
  const f=await setup(db,{stock:4});
  await asUser(db,13);
  const input={shopId:f.shopId,id:f.partId,sku:'BELT',name:'Updated belt',unitCostPkr:99,reorderLevel:1,active:false};
  const p=(await db.query('select public.save_inventory_part($1) p',[input])).rows[0].p;
  assert.equal(p.quantityOnHand,4); assert.equal(p.active,false);
  await expectSqlState(db,'select public.save_inventory_part($1)',[{...input,quantityOnHand:100}],'22023');
  await expectSqlState(db,'select public.save_inventory_part($1)',[{...input,id:randomUUID()}],'P0002');
  await expectSqlState(db,'select public.save_inventory_part($1)',[{...input,id:undefined,quantityOnHand:1}],'23505');
  const page=(await db.query('select public.list_inventory($1) p',[{shopId:f.shopId,page:1}])).rows[0].p;
  assert.equal(page.total,2); assert.equal(page.pageSize,50); assert.equal(page.items[0].unitCostPkr,99);
  for(const actor of [3,11,12,33]) {
    await asUser(db,actor);
    await expectSqlState(db,'select public.list_inventory($1)',[{shopId:f.shopId}],'42501');
    await expectSqlState(db,'select public.save_inventory_part($1)',[input],'42501');
  }
  await asUser(db,12);
  const detail=(await db.query('select public.get_booking($1) b',[{bookingId:f.bookingId}])).rows[0].b;
  assert.equal(detail.requiredParts.length,2); assert.equal(detail.requiredParts[0].unitCostPkr,undefined);
  await apply(db,13,action(f.bookingId,'MARK_PARTS_READY',7));
  assert.equal((await apply(db,13,action(f.bookingId,'ALLOCATE_PARTS',8))).booking.status,'IN_REPAIR');
}));
test('B08 allocation rolls back all business effects if its final receipt write fails',()=>withDatabase(async db=>{
  const f=await setup(db,{stock:5});
  await apply(db,13,action(f.bookingId,'MARK_PARTS_READY',7));
  await db.query('reset role');
  await db.query(`create function pg_temp.fail_parts_receipt() returns trigger language plpgsql as $$
    begin raise exception 'Injected final-write failure' using errcode='XX000'; end; $$;
    create trigger b08_test_failure before insert on private.booking_action_receipts
    for each row execute function pg_temp.fail_parts_receipt();`);
  await asUser(db,13);
  await expectSqlState(db,actionRpc,[action(f.bookingId,'ALLOCATE_PARTS',8)],'XX000');
  assert.equal(await stock(db,f.partId),5); assert.equal(await stock(db,f.secondPartId),20);
  const audit=(await db.query(`select
    (select count(*)::integer from public.part_allocations where booking_id=$1) allocations,
    (select count(*)::integer from public.booking_history where booking_id=$1 and action='ALLOCATE_PARTS') history,
    (select count(*)::integer from public.notifications where booking_id=$1 and type='ALLOCATE_PARTS') notices,
    (select state_version from public.bookings where id=$1) version`,[f.bookingId])).rows[0];
  assert.deepEqual(audit,{allocations:0,history:0,notices:0,version:8});
}));
test('B08 wrappers are invokers; ordinary actors cannot execute stock helpers or access receipts',()=>withDatabase(async db=>{
  const functions=(await db.query(`select p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') user_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('save_inventory_part','list_inventory'))
      or (n.nspname='private' and p.proname in ('normalize_parts_payload','approved_part_requirements','execute_parts_action',
        'required_parts_dto','purchase_orders_dto','release_pre_repair_parts','inventory_part_dto'))`)).rows;
  assert.equal(functions.length,9);
  for(const f of functions) {
    assert.equal(f.anon_execute,false);
    assert.equal(f.user_execute,['save_inventory_part','list_inventory'].includes(f.proname));
    assert.equal(f.prosecdef,false);
  }
  await asUser(db,null,'anon');
  await expectSqlState(db,'select public.save_inventory_part($1)',[{}],'42501');
  await asUser(db,null);
  await expectSqlState(db,'select public.list_inventory($1)',[{}],'42501');
  await asUser(db,13);
  await expectSqlState(db,"select private.normalize_parts_payload('ALLOCATE_PARTS','{}')",[],'42501');
  await expectSqlState(db,'select * from private.booking_action_receipts',[],'42501');
}));
