import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { user } from './helpers.mjs';
import { action, actionRpc, apply, setup, makeApproved } from './parts-fixtures.mjs';

async function connect() {
  const connectionString=process.env.BAYFLOW_TEST_DB_URL;
  if (!connectionString || !['127.0.0.1','localhost','[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('Parts races require the disposable loopback harness.');
  const db=new pg.Client({connectionString}); await db.connect(); return db;
}
async function fixture(callback) {
  const admin=await connect(), first=await connect(), second=await connect();
  try {
    await admin.query('begin');
    const f=await setup(admin,{stock:3});
    f.otherBookingId=await makeApproved(admin,f,{customer:4,partsActor:23});
    await apply(admin,13,action(f.bookingId,'MARK_PARTS_READY',7));
    await apply(admin,23,action(f.otherBookingId,'MARK_PARTS_READY',7));
    await admin.query('commit');
    await callback({admin,first,second,f});
  } finally {
    for(const db of [first,second,admin]) { await db.query('rollback'); await db.end(); }
  }
}
async function begin(db,actor) {
  await db.query('begin'); await db.query('set local statement_timeout=10000');
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user(actor)]);
}
async function waitForLock(admin,pid) {
  const end=Date.now()+5000;
  while(Date.now()<end) {
    const row=(await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(row?.wait_event_type==='Lock') return;
  }
  assert.fail('Expected competing parts operation to wait for a PostgreSQL lock.');
}
async function attempt(db,input) {
  try { const result=(await db.query(actionRpc,[input])).rows[0].result; await db.query('commit'); return {result}; }
  catch(error) { await db.query('rollback'); return {code:error.code}; }
}
test('B08 two READY jobs contend for shared stock: one allocates, loser conflicts with no partial deduction',()=>fixture(async({admin,first,second,f})=>{
  const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
  await begin(first,13); await begin(second,23);
  const winner=(await first.query(actionRpc,[action(f.bookingId,'ALLOCATE_PARTS',8)])).rows[0].result;
  assert.equal(winner.booking.status,'IN_REPAIR');
  const pending=attempt(second,action(f.otherBookingId,'ALLOCATE_PARTS',8));
  await waitForLock(admin,pid); await first.query('commit');
  assert.deepEqual(await pending,{code:'BF104'});
  const parts=(await admin.query('select id,quantity_on_hand from public.inventory_parts where shop_id=$1',[f.shopId])).rows;
  assert.equal(parts.find(p=>p.id===f.partId).quantity_on_hand,0);
  assert.equal(parts.find(p=>p.id===f.secondPartId).quantity_on_hand,18);
  assert.equal((await admin.query('select count(*)::integer n from public.part_allocations where booking_id=$1',[f.otherBookingId])).rows[0].n,0);
  assert.equal((await admin.query('select status,state_version from public.bookings where id=$1',[f.otherBookingId])).rows[0].state_version,8);
  await begin(second,23);
  const reordered=await attempt(second,action(f.otherBookingId,'ORDER_PARTS',8,{items:[{partId:f.partId,quantity:3}]}));
  assert.equal(reordered.result.booking.status,'PARTS_READY');
  assert.equal(reordered.result.booking.stateVersion,8);
  const notices=(await admin.query("select message from public.notifications where booking_id=$1 and type='ORDER_PARTS'",[f.otherBookingId])).rows;
  assert.equal(notices.length,2);
  assert.ok(notices.every(n=>n.message==='Missing parts have been ordered.'));
  const po=reordered.result.booking.purchaseOrders[0];
  await begin(second,23);
  assert.equal((await attempt(second,action(f.otherBookingId,'RECEIVE_PARTS',8,{purchaseOrderId:po.id,items:[{partId:f.partId,quantity:3}]}))).result.booking.status,'PARTS_READY');
  await begin(second,23);
  assert.equal((await attempt(second,action(f.otherBookingId,'ALLOCATE_PARTS',8))).result.booking.status,'IN_REPAIR');
}));
test('B08 simultaneous same-key allocation retries create one stock deduction, history event and receipt',()=>fixture(async({admin,first,second,f})=>{
  const input=action(f.bookingId,'ALLOCATE_PARTS',8);
  await begin(first,13); await begin(second,13);
  const results=await Promise.all([attempt(first,input),attempt(second,input)]);
  assert.ok(results.every(r=>r.result)); assert.equal(results.filter(r=>r.result.replayed).length,1);
  assert.equal((await admin.query('select quantity_on_hand from public.inventory_parts where id=$1',[f.partId])).rows[0].quantity_on_hand,0);
  const counts=(await admin.query(`select
    (select count(*)::integer from public.part_allocations where booking_id=$1) allocations,
    (select count(*)::integer from public.booking_history where booking_id=$1 and action='ALLOCATE_PARTS') history,
    (select count(*)::integer from private.booking_action_receipts where booking_id=$1 and action='ALLOCATE_PARTS') receipts`,[f.bookingId])).rows[0];
  assert.deepEqual(counts,{allocations:2,history:1,receipts:1});
}));
