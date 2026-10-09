import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { asUser, expectSqlState, id, user, withDatabase } from './helpers.mjs';

const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]));
const vehicle={registrationPlate:'B06-NEW',make:'Honda',model:'Civic',year:2016,color:null,mileageKm:null};
const createRpc='select public.create_booking($1) as result';
const actionRpc='select public.apply_booking_action($1) as result';
async function setup(db) {
  await asUser(db,1);
  const s=(await db.query('select public.save_shop(null,$1) as s',[{name:'B06 Native',city:'Lahore',
    address:'Native B06 fixture',phone:'+920000000000',workingHours:hours,slotCapacity:4}])).rows[0].s;
  const service=(await db.query('select public.save_service($1,null,$2) as s',[s.id,{name:'Inspection',durationMinutes:60}])).rows[0].s;
  await db.query('reset role');
  await db.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    ($1,$2,'SA',true),($1,$3,'SA',false),($1,$4,'TECHNICIAN',true),($1,$5,'TECHNICIAN',true),
    ($1,$6,'TECHNICIAN',false),($1,$7,'PARTS',true),($1,$8,'QC',true)`,
    [s.id,user(11),user(21),user(12),user(22),user(32),user(13),user(14)]);
  const slot=(await db.query(`select id from public.appointment_slots where shop_id=$1
    and (starts_at at time zone 'Asia/Karachi')::date=(clock_timestamp() at time zone 'Asia/Karachi')::date+1
    order by starts_at limit 1`,[s.id])).rows[0].id;
  await asUser(db,3);
  const input={shopId:s.id,slotId:slot,serviceIds:[service.id],symptomNotes:'',vehicle:{...vehicle},idempotencyKey:randomUUID()};
  const booking=(await db.query(createRpc,[input])).rows[0].result.booking;
  return {shopId:s.id,serviceId:service.id,booking};
}
const action=(bookingId, actionName, expectedVersion, payload={}) => ({
  bookingId, action:actionName, expectedVersion, payload, idempotencyKey:randomUUID(),
});
async function apply(db, actor, body) {
  await asUser(db,actor);
  return (await db.query(actionRpc,[body])).rows[0].result;
}

test('B06 SA confirms and assigns, assigned technician starts inspection with history and notices',()=>withDatabase(async db=>{
  const {booking,shopId}=await setup(db);
  let result=await apply(db,11,action(booking.id,'CONFIRM_BOOKING',0));
  assert.equal(result.replayed,false); assert.equal(result.booking.status,'CONFIRMED'); assert.equal(result.booking.stateVersion,1);
  result=await apply(db,11,action(booking.id,'ASSIGN_TECHNICIAN',1,{technicianUserId:user(12)}));
  assert.equal(result.booking.status,'ASSIGNED'); assert.equal(result.booking.technicianUserId,user(12)); assert.equal(result.booking.stateVersion,2);
  result=await apply(db,12,action(booking.id,'START_INSPECTION',2));
  assert.equal(result.booking.status,'INSPECTING'); assert.equal(result.booking.stateVersion,3);
  await db.query('reset role');
  const history=(await db.query('select action,from_status,to_status,actor_user_id from public.booking_history where booking_id=$1 order by created_at,id',[booking.id])).rows;
  assert.deepEqual(history.map(row=>row.action),['CREATE_BOOKING','CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION']);
  assert.deepEqual(history.slice(1).map(row=>[row.from_status,row.to_status]),[
    ['PENDING','CONFIRMED'],['CONFIRMED','ASSIGNED'],['ASSIGNED','INSPECTING'],
  ]);
  const notices=(await db.query('select user_id,type from public.notifications where shop_id=$1 order by created_at,id',[shopId])).rows;
  assert.ok(notices.some(row=>row.user_id===user(12)&&row.type==='TECHNICIAN_ASSIGNED'));
  assert.ok(notices.some(row=>row.user_id===user(3)&&row.type==='BOOKING_CONFIRMED'));
}));

test('B06 action idempotency replays current booking and rejects changed payload',()=>withDatabase(async db=>{
  const {booking}=await setup(db);
  const body=action(booking.id,'CONFIRM_BOOKING',0);
  const first=await apply(db,11,body);
  await db.query('reset role');
  await db.query("update public.bookings set notes='changed after action' where id=$1",[booking.id]);
  const replay=await apply(db,11,body);
  assert.equal(replay.replayed,true); assert.equal(replay.booking.id,first.booking.id); assert.equal(replay.booking.status,'CONFIRMED');
  await asUser(db,11);
  await expectSqlState(db,actionRpc,[{...body,expectedVersion:1}],'BF102');
  await db.query('reset role');
  assert.equal((await db.query("select count(*)::integer from public.booking_history where booking_id=$1 and action='CONFIRM_BOOKING'",[booking.id])).rows[0].count,1);
}));

test('B06 stale versions, wrong roles, inactive/foreign technicians and wrong states are denied atomically',()=>withDatabase(async db=>{
  const {booking}=await setup(db);
  await asUser(db,11); await expectSqlState(db,actionRpc,[action(booking.id,'CONFIRM_BOOKING',1)],'BF101');
  await asUser(db,12); await expectSqlState(db,actionRpc,[action(booking.id,'CONFIRM_BOOKING',0)],'P0002');
  await apply(db,11,action(booking.id,'CONFIRM_BOOKING',0));
  for(const technicianUserId of [user(21),user(32),user(3),randomUUID()]) {
    await asUser(db,11); await expectSqlState(db,actionRpc,[action(booking.id,'ASSIGN_TECHNICIAN',1,{technicianUserId})],'P0002');
  }
  await apply(db,11,action(booking.id,'ASSIGN_TECHNICIAN',1,{technicianUserId:user(12)}));
  await asUser(db,22); await expectSqlState(db,actionRpc,[action(booking.id,'START_INSPECTION',2)],'P0002');
  await apply(db,12,action(booking.id,'START_INSPECTION',2));
  await asUser(db,11); await expectSqlState(db,actionRpc,[action(booking.id,'ASSIGN_TECHNICIAN',3,{technicianUserId:user(22)})],'BF103');
}));

test('B06 customer or SA can cancel before repair; terminal and repair-stage bookings reject future actions',()=>withDatabase(async db=>{
  const {booking}=await setup(db);
  let result=await apply(db,3,action(booking.id,'CANCEL_BOOKING',0,{reason:'Customer changed plans'}));
  assert.equal(result.booking.status,'CANCELLED'); assert.equal(result.booking.stateVersion,1);
  await asUser(db,11); await expectSqlState(db,actionRpc,[action(booking.id,'CONFIRM_BOOKING',1)],'BF103');
  const second=(await setup(db)).booking;
  result=await apply(db,11,action(second.id,'CANCEL_BOOKING',0,{reason:'Shop cannot accept this booking'}));
  assert.equal(result.booking.status,'CANCELLED');
  await db.query('reset role');
  await db.query("update public.bookings set status='IN_REPAIR',state_version=8 where id=$1",[second.id]);
  await asUser(db,11); await expectSqlState(db,actionRpc,[action(second.id,'CANCEL_BOOKING',8,{reason:'Too late'})],'BF103');
}));

test('B06 read lists and detail projection are role scoped',()=>withDatabase(async db=>{
  const {booking,shopId}=await setup(db);
  await apply(db,11,action(booking.id,'CONFIRM_BOOKING',0));
  await apply(db,11,action(booking.id,'ASSIGN_TECHNICIAN',1,{technicianUserId:user(12)}));
  await asUser(db,3);
  const mine=(await db.query('select public.list_my_bookings($1) r',[{}])).rows[0].r;
  assert.ok(mine.some(row=>row.id===booking.id));
  assert.equal((await db.query('select public.get_booking($1) b',[{bookingId:booking.id}])).rows[0].b.history.length,3);
  await asUser(db,4); await expectSqlState(db,'select public.get_booking($1)',[{bookingId:booking.id}],'P0002');
  await asUser(db,11);
  assert.equal((await db.query('select public.list_shop_bookings($1) r',[{shopId,status:'ASSIGNED'}])).rows[0].r.items.length,1);
  await asUser(db,12);
  assert.equal((await db.query('select public.list_shop_bookings($1) r',[{shopId,assignee:'mine'}])).rows[0].r.items.length,1);
  await asUser(db,22);
  assert.equal((await db.query('select public.list_shop_bookings($1) r',[{shopId}])).rows[0].r.items.length,0);
  await asUser(db,21); await expectSqlState(db,'select public.list_shop_bookings($1)',[{shopId}],'P0002');
}));

test('B06 private receipts and helper functions are not exposed to ordinary users',()=>withDatabase(async db=>{
  const {booking}=await setup(db);
  await asUser(db,11); await db.query(actionRpc,[action(booking.id,'CONFIRM_BOOKING',0)]);
  await expectSqlState(db,'select * from private.booking_action_receipts',[],'42501');
  await db.query('reset role');
  const functions=(await db.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') user_exec from pg_proc p
    where p.proname in ('apply_booking_action','apply_booking_action_impl','get_booking','list_my_bookings','list_shop_bookings','booking_action_dto')`)).rows;
  assert.equal(functions.length,6);
  for(const f of functions) {
    assert.ok(f.proconfig.includes('search_path=""')); assert.equal(f.anon_exec,false);
    assert.equal(f.user_exec,!['booking_action_dto'].includes(f.proname));
    assert.equal(f.prosecdef,['apply_booking_action_impl','get_booking','list_my_bookings','list_shop_bookings'].includes(f.proname));
  }
}));
