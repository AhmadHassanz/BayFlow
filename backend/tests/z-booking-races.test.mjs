import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { user } from './helpers.mjs';

// Committed concurrency fixtures live only in the harness's disposable loopback
// cluster. Files run sequentially; this file runs after rollback-only regressions.
async function connect() {
  const connectionString=process.env.BAYFLOW_TEST_DB_URL;
  if(!connectionString || !['127.0.0.1','localhost','[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('B05 races require the disposable native loopback harness.');
  const db=new pg.Client({connectionString}); await db.connect(); return db;
}
async function fixture(callback) {
  const admin=await connect(), connections=[]; let s;
  try {
    await admin.query('begin');
    await admin.query('set local role authenticated');
    await admin.query("select set_config('request.jwt.claim.sub',$1,true)",[user(1)]);
    s=(await admin.query('select public.save_shop(null,$1) s',[{name:`B05 Race ${randomUUID()}`,city:'Lahore',
      address:'Disposable native concurrency fixture',phone:'+920000000000',slotCapacity:2,
      workingHours:Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]))}])).rows[0].s;
    const service=(await admin.query('select public.save_service($1,null,$2) s',[s.id,{name:'Inspection',durationMinutes:60}])).rows[0].s;
    await admin.query('reset role');
    await admin.query("insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,'SA')",[s.id,user(11)]);
    const actors=Array.from({length:8},()=>randomUUID());
    for(const actor of actors) {
      await admin.query('insert into auth.users(id,email) values($1,$2)',[actor,`${actor}@bayflow.example.test`]);
      await admin.query("insert into public.profiles(id,full_name) values($1,'Native race customer')",[actor]);
    }
    const slots=(await admin.query(`select id from public.appointment_slots where shop_id=$1
      and (starts_at at time zone 'Asia/Karachi')::date=(now() at time zone 'Asia/Karachi')::date+1 order by starts_at`,[s.id])).rows;
    await admin.query('commit');
    const input={shopId:s.id,slotId:slots[0].id,serviceIds:[service.id],symptomNotes:'',
      vehicle:{registrationPlate:'B05-RACE',make:'Honda',model:'Civic',year:2016},idempotencyKey:randomUUID()};
    // All connections are established before dispatch, with no timing sleeps.
    for(let i=0;i<8;i++) connections.push(await connect());
    await callback({admin,connections,actors,input,shop:s});
  } finally {
    for(const db of connections) { await db.query('rollback'); await db.end(); }
    await admin.query('rollback');
    if(s) await admin.query('update public.shops set active=false where id=$1',[s.id]);
    await admin.end();
  }
}
async function beginActor(db,actor) {
  await db.query('begin'); await db.query('set local statement_timeout=10000');
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
}
async function attempt(db,input) {
  try {
    const result=(await db.query('select public.create_booking($1) result',[input])).rows[0].result;
    await db.query('commit'); return {result};
  } catch(error) { await db.query('rollback'); return {code:error.code}; }
}
async function verifyEffects(admin,input,n) {
  const rows=(await admin.query(`select
    (select count(*)::integer from public.bookings where shop_id=$1) bookings,
    (select count(*)::integer from public.booking_services where shop_id=$1) services,
    (select count(*)::integer from public.booking_history where shop_id=$1) history,
    (select count(*)::integer from public.notifications where shop_id=$1) notices,
    (select count(*)::integer from private.booking_receipts where payload->>'shopId'=$1::text) receipts`,[input.shopId])).rows[0];
  assert.deepEqual(rows,{bookings:n,services:n,history:n,notices:n,receipts:n});
}
test('B05 eight simultaneous distinct customers: exactly capacity succeeds and six conflict with no vehicle leaks',()=>fixture(async({admin,connections,actors,input})=>{
  await Promise.all(connections.map((db,i)=>beginActor(db,actors[i])));
  const results=await Promise.all(connections.map(db=>attempt(db,input)));
  assert.equal(results.filter(r=>r.result).length,2); assert.equal(results.filter(r=>r.code==='BF001').length,6);
  await verifyEffects(admin,input,2);
  const vehicles=(await admin.query('select count(*)::integer n from public.vehicles where customer_id=any($1)',[actors])).rows[0].n;
  assert.equal(vehicles,2);
}));
test('B05 eight simultaneous retries of one key commit exactly one complete operation',()=>fixture(async({admin,connections,actors,input})=>{
  await Promise.all(connections.map(db=>beginActor(db,actors[0])));
  const results=await Promise.all(connections.map(db=>attempt(db,input)));
  assert.ok(results.every(r=>r.result));
  assert.equal(results.filter(r=>!r.result.replayed).length,1);
  assert.equal(new Set(results.map(r=>r.result.booking.id)).size,1);
  await verifyEffects(admin,input,1);
  assert.equal((await admin.query('select count(*)::integer n from public.vehicles where customer_id=$1',[actors[0]])).rows[0].n,1);
}));
test('B05 concurrent different keys for the same customer reuse one vehicle',()=>fixture(async({admin,connections,actors,input})=>{
  await Promise.all(connections.slice(0,2).map(db=>beginActor(db,actors[0])));
  const results=await Promise.all(connections.slice(0,2).map(db=>attempt(db,{...input,idempotencyKey:randomUUID()})));
  assert.ok(results.every(r=>r.result)); assert.equal(new Set(results.map(r=>r.result.booking.vehicleId)).size,1);
  await verifyEffects(admin,input,2);
}));
async function waitForLock(observer,pid) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    const row=(await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(row?.wait_event_type==='Lock') return;
  }
  assert.fail('Expected a real PostgreSQL lock wait.');
}
test('B05 schedule save and booking serialize in both directions without stale acceptance or deadlock',()=>fixture(async({admin,connections,actors,input})=>{
  const owner=connections[0], customer=connections[1];
  // Owner unpublishes while holding its transaction; booking must wait and reject.
  await beginActor(owner,user(1));
  await owner.query('select public.save_shop($1,$2)',[input.shopId,{active:false}]);
  await beginActor(customer,actors[0]);
  const blocked=attempt(customer,input);
  await waitForLock(admin,customer.processID); await owner.query('commit');
  assert.equal((await blocked).code,'P0002'); await verifyEffects(admin,input,0);
  // Booking holds shared shop and exclusive slot locks; owner closure must wait,
  // then see the committed appointment and roll back its incompatible schedule.
  await admin.query('update public.shops set active=true where id=$1',[input.shopId]);
  await beginActor(customer,actors[0]);
  await customer.query('select public.create_booking($1)',[input]);
  await beginActor(owner,user(1));
  const closing=owner.query('select public.save_shop($1,$2)',[input.shopId,{workingHours:{}}])
    .then(()=>null,error=>error.code);
  await waitForLock(admin,owner.processID); await customer.query('commit');
  assert.equal(await closing,'23514'); await owner.query('rollback');
  await verifyEffects(admin,input,1);
}));
