import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { asUser, expectSqlState, id, shop, user, withDatabase } from './helpers.mjs';

const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]));
const vehicle={registrationPlate:'B05-NEW',make:'Honda',model:'Civic',year:2016,color:null,mileageKm:null};
const rpc='select public.create_booking($1) as result';
async function setup(db) {
  await asUser(db,1);
  const s=(await db.query('select public.save_shop(null,$1) as s',[{name:'B05 Native',city:'Lahore',
    address:'Native test fixture',phone:'+920000000000',workingHours:hours,slotCapacity:3}])).rows[0].s;
  const service=(await db.query('select public.save_service($1,null,$2) as s',[s.id,{name:'Inspection',durationMinutes:60}])).rows[0].s;
  await db.query('reset role');
  await db.query(`insert into public.shop_memberships(shop_id,user_id,role,active)
    values($1,$2,'SA',true),($1,$3,'SA',false)`,[s.id,user(11),user(21)]);
  const slots=(await db.query(`select * from public.appointment_slots where shop_id=$1
    and (starts_at at time zone 'Asia/Karachi')::date=(clock_timestamp() at time zone 'Asia/Karachi')::date+1
    order by starts_at`,[s.id])).rows;
  await asUser(db,3);
  return {shopId:s.id,slotId:slots[0].id,serviceIds:[service.id],symptomNotes:'',vehicle:{...vehicle},idempotencyKey:randomUUID()};
}
async function counts(db,input) {
  await db.query('reset role');
  return (await db.query(`select
    (select count(*)::integer from public.bookings where shop_id=$1) bookings,
    (select count(*)::integer from public.booking_services where shop_id=$1) services,
    (select count(*)::integer from public.booking_history where shop_id=$1) history,
    (select count(*)::integer from public.notifications where shop_id=$1) notices,
    (select count(*)::integer from private.booking_receipts where payload->>'shopId'=$1::text) receipts,
    (select count(*)::integer from public.vehicles where registration_plate='B05-NEW') vehicles`,[input.shopId])).rows[0];
}

test('B05 known service atomically creates PENDING, services, history, active-SA notice and receipt',()=>withDatabase(async db=>{
  const input=await setup(db), {booking,replayed}=(await db.query(rpc,[input])).rows[0].result;
  assert.equal(replayed,false); assert.equal(booking.customerId,user(3)); assert.equal(booking.status,'PENDING');
  assert.equal(booking.stateVersion,0); assert.deepEqual(booking.serviceIds,input.serviceIds);
  assert.deepEqual(await counts(db,input),{bookings:1,services:1,history:1,notices:1,receipts:1,vehicles:1});
  const event=(await db.query('select * from public.booking_history where booking_id=$1',[booking.id])).rows[0];
  assert.equal(event.from_status,null); assert.equal(event.to_status,'PENDING'); assert.equal(event.actor_user_id,user(3));
  assert.equal(event.action,'CREATE_BOOKING');
  assert.equal((await db.query('select user_id from public.notifications where booking_id=$1',[booking.id])).rows[0].user_id,user(11));
  for(const actor of [3,11,1]) {
    await asUser(db,actor); assert.equal((await db.query('select id from public.bookings where id=$1',[booking.id])).rowCount,1);
  }
  for(const actor of [4,12,21]) {
    await asUser(db,actor); assert.equal((await db.query('select id from public.bookings where id=$1',[booking.id])).rowCount,0);
  }
  await db.query('set constraints all immediate');
}));

test('B05 symptom-only booking needs no diagnosis or service and reuses only an exact own vehicle',()=>withDatabase(async db=>{
  const input=await setup(db); input.serviceIds=[]; input.symptomNotes='Brake squeaks when stopping.';
  input.vehicle={registrationPlate:' lea-1234 ',make:'Honda',model:'Civic',year:2016};
  const result=(await db.query(rpc,[input])).rows[0].result;
  assert.equal(result.booking.vehicleId,id('60',1)); assert.deepEqual(result.booking.serviceIds,[]);
  assert.equal(result.booking.symptomNotes,input.symptomNotes);
  assert.equal((await counts(db,input)).vehicles,0);
}));

test('B05 replay normalizes defaults/whitespace/service order and returns current state without side effects',()=>withDatabase(async db=>{
  const input=await setup(db);
  await db.query('reset role');
  const second=(await db.query(`insert into public.services(shop_id,name,duration_minutes) values($1,'Second',60) returning id`,[input.shopId])).rows[0].id;
  input.serviceIds.push(second); await asUser(db,3);
  const first=(await db.query(rpc,[input])).rows[0].result.booking;
  const before=await counts(db,input);
  await db.query("update public.bookings set status='CONFIRMED',state_version=1 where id=$1",[first.id]);
  await db.query('update public.shops set active=false where id=$1',[input.shopId]);
  await asUser(db,3);
  const retry={...input,serviceIds:[...input.serviceIds].reverse(),vehicle:{registrationPlate:' b05-new ',make:' Honda ',model:'Civic',year:2016}};
  const result=(await db.query(rpc,[retry])).rows[0].result;
  assert.equal(result.replayed,true); assert.equal(result.booking.id,first.id);
  assert.equal(result.booking.status,'CONFIRMED'); assert.equal(result.booking.stateVersion,1);
  assert.deepEqual(await counts(db,input),before);
}));

test('B05 a key reused with changed notes, services, slot, shop or vehicle conflicts atomically',()=>withDatabase(async db=>{
  const input=await setup(db); await db.query(rpc,[input]); const before=await counts(db,input);
  for(const patch of [{symptomNotes:'Changed meaningful symptoms'}, {serviceIds:[] ,symptomNotes:'Unknown engine symptoms'},
    {slotId:randomUUID()},{shopId:shop(2)},{vehicle:{...vehicle,make:'Toyota'}}]) {
    await asUser(db,3); await expectSqlState(db,rpc,[{...input,...patch}],'BF002');
    assert.deepEqual(await counts(db,input),before);
  }
}));

test('B05 invalid and foreign shop/slot/service IDs leave no effects',()=>withDatabase(async db=>{
  const input=await setup(db);
  for(const [patch,code] of [[{shopId:randomUUID()},'P0002'],[{slotId:randomUUID()},'P0002'],
    [{slotId:id('40',2)},'P0002'],[{shopId:shop(2)},'P0002'],
    [{serviceIds:[id('30',2)]},'22023'],[{serviceIds:[randomUUID()]},'22023']]) {
    await asUser(db,3); await expectSqlState(db,rpc,[{...input,...patch}],code);
    assert.deepEqual(await counts(db,input),{bookings:0,services:0,history:0,notices:0,receipts:0,vehicles:0});
  }
  await db.query('update public.services set active=false where id=$1',[input.serviceIds[0]]);
  await asUser(db,3); await expectSqlState(db,rpc,[input],'22023');
}));

test('B05 foreign vehicle IDs are rejected; matching a foreign plate never reuses or changes its vehicle',()=>withDatabase(async db=>{
  const input=await setup(db);
  await expectSqlState(db,rpc,[{...input,vehicle:{...vehicle,id:id('60',2)}}],'22023');
  await db.query('reset role'); const original=(await db.query('select * from public.vehicles where id=$1',[id('60',2)])).rows[0];
  input.vehicle={registrationPlate:original.registration_plate,make:original.make,model:original.model,year:original.year};
  await asUser(db,3); const booking=(await db.query(rpc,[input])).rows[0].result.booking;
  assert.notEqual(booking.vehicleId,original.id);
  await db.query('reset role');
  assert.deepEqual((await db.query('select * from public.vehicles where id=$1',[original.id])).rows[0],original);
  assert.equal((await db.query('select customer_id from public.vehicles where id=$1',[booking.vehicleId])).rows[0].customer_id,user(3));
}));

test('B05 an existing own plate with conflicting details is not silently modified',()=>withDatabase(async db=>{
  const input=await setup(db); input.vehicle={...vehicle,registrationPlate:'LEA-1234',model:'Other model'};
  await expectSqlState(db,rpc,[input],'BF003');
  assert.equal((await counts(db,input)).bookings,0);
  assert.equal((await db.query('select model from public.vehicles where id=$1',[id('60',1)])).rows[0].model,'Civic');
}));

test('B05 closed, unpublished, elapsed, out-of-horizon and mismatched slots fail without writes',()=>withDatabase(async db=>{
  const input=await setup(db);
  for(const [sql,params,code] of [
    ['update public.shops set active=false where id=$1',[input.shopId],'P0002'],
    ["update public.shops set working_hours='{}' where id=$1",[input.shopId],'BF001'],
    ["update public.appointment_slots set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[input.slotId],'BF001'],
    ["update public.appointment_slots set starts_at=starts_at+interval '15 days',ends_at=ends_at+interval '15 days' where id=$1",[input.slotId],'BF001'],
    ['update public.appointment_slots set capacity=capacity+1 where id=$1',[input.slotId],'BF001'],
    ["update public.appointment_slots set ends_at=ends_at+interval '1 minute' where id=$1",[input.slotId],'BF001'],
  ]) {
    await db.query('reset role'); await db.query('savepoint eligibility'); await db.query(sql,params); await asUser(db,3);
    await expectSqlState(db,rpc,[input],code); assert.equal((await counts(db,input)).bookings,0);
    await db.query('rollback to savepoint eligibility');
  }
}));

test('B05 strict SQL validation denies authority/password fields and malformed input',()=>withDatabase(async db=>{
  const input=await setup(db);
  for(const patch of [{customerId:user(4)}, {status:'COMPLETED'},{role:'SA'},{password:'Never accepted'},
    {serviceIds:[input.serviceIds[0],input.serviceIds[0]]},{serviceIds:[null]},{serviceIds:[1]},
    {serviceIds:[],symptomNotes:'.........a'}, {serviceIds:[],symptomNotes:'   '},
    {symptomNotes:null},{idempotencyKey:'bad'},{slotId:null},{vehicle:null},
    {vehicle:{...vehicle,customerId:user(4)}},{vehicle:{...vehicle,year:2016.5}},
    {vehicle:{...vehicle,mileageKm:-1}},{vehicle:{...vehicle,mileageKm:2147483648}},
    {vehicle:{...vehicle,color:''}},{vehicle:{...vehicle,make:''}},
  ]) await expectSqlState(db,rpc,[{...input,...patch}],'22023');
  assert.equal((await counts(db,input)).bookings,0);
}));

test('B05 failure at the final receipt insert rolls back vehicle, booking, services, history and notices',()=>withDatabase(async db=>{
  const input=await setup(db); await db.query('reset role');
  await db.query("insert into auth.users(id,email) values($1,'b05-rollback@bayflow.example.test')",[user(98)]);
  await db.query(`create function pg_temp.fail_receipt() returns trigger language plpgsql as $$
    begin raise exception 'Injected final-write failure' using errcode='XX000'; end; $$;
    create trigger b05_test_failure before insert on private.booking_receipts
    for each row execute function pg_temp.fail_receipt();`);
  await asUser(db,98); await expectSqlState(db,rpc,[input],'XX000');
  assert.deepEqual(await counts(db,input),{bookings:0,services:0,history:0,notices:0,receipts:0,vehicles:0});
  assert.equal((await db.query('select id from public.profiles where id=$1',[user(98)])).rowCount,0);
}));

test('B05 COMPLETED still consumes capacity and only CANCELLED releases a place',()=>withDatabase(async db=>{
  const input=await setup(db), bookings=[];
  for(let i=0;i<3;i++) bookings.push((await db.query(rpc,[{...input,idempotencyKey:randomUUID()}])).rows[0].result.booking);
  await db.query('reset role');
  await db.query("update public.bookings set status='COMPLETED',completed_at=now() where id=$1",[bookings[0].id]);
  await asUser(db,3); await expectSqlState(db,rpc,[input],'BF001');
  await db.query('reset role');
  await db.query("update public.bookings set status='CANCELLED' where id=$1",[bookings[1].id]);
  await asUser(db,3); assert.equal((await db.query(rpc,[input])).rows[0].result.booking.status,'PENDING');
  assert.deepEqual(await counts(db,input),{bookings:4,services:4,history:4,notices:4,receipts:4,vehicles:1});
}));

test('B05 anonymous/missing identity and direct receipt access are denied; RPC grants are narrow',()=>withDatabase(async db=>{
  const input=await setup(db);
  await asUser(db,null,'anon'); await expectSqlState(db,rpc,[input],'42501');
  await asUser(db,null); await expectSqlState(db,rpc,[input],'42501');
  await asUser(db,3); await expectSqlState(db,'select * from private.booking_receipts',[],'42501');
  await expectSqlState(db,'insert into public.bookings(shop_id) values($1)',[input.shopId],'42501');
  await db.query('reset role');
  const functions=(await db.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') user_exec from pg_proc p
    where p.proname in ('create_booking','create_booking_impl','booking_creation_dto')`)).rows;
  assert.equal(functions.length,3);
  for(const f of functions) {
    assert.ok(f.proconfig.includes('search_path=""')); assert.equal(f.anon_exec,false);
    assert.equal(f.user_exec,f.proname!=='booking_creation_dto'); assert.equal(f.prosecdef,f.proname==='create_booking_impl');
  }
  const table=(await db.query(`select relrowsecurity,
    has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed
    from pg_class where oid='private.booking_receipts'::regclass`)).rows[0];
  assert.equal(table.relrowsecurity,true); assert.equal(table.allowed,false);
}));
