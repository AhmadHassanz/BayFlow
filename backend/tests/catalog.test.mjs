import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asUser, expectSqlState, id, shop, user, withDatabase } from './helpers.mjs';

const hours = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day => [day, [['09:00','12:00'],['13:00','15:00']]]));
const settings = { name:'B04 Native Shop',city:'Lahore',address:'Native test address',phone:'+924235751001',
  workingHours:hours,slotCapacity:2 };
async function create(db, value = settings) {
  return (await db.query('select public.save_shop(null,$1) as shop',[value])).rows[0].shop;
}
const update = 'select public.save_shop($1,$2) as shop';

test('B04 first shop creates profile/owner atomically; one identity can own two shops', () => withDatabase(async db => {
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'b04-native@bayflow.example.test','{\"full_name\":\"New owner\"}')",[user(98)]);
  await asUser(db,98);
  const a = await create(db), b = await create(db,{...settings,name:'Second Shop'});
  assert.notEqual(a.id,b.id); assert.notEqual(a.slug,b.slug);
  assert.equal(a.timezone,'Asia/Karachi'); assert.equal(a.slotDurationMinutes,60);
  assert.equal((await db.query('select * from public.shop_memberships where user_id=$1 and role=\'OWNER\'',[user(98)])).rowCount,2);
  assert.equal((await db.query('select * from public.profiles where id=$1',[user(98)])).rowCount,1);
  await db.query('set constraints all immediate');
}));

test('B04 failed setup rolls back without profile, shop or membership side effects', () => withDatabase(async db => {
  await db.query("insert into auth.users(id,email) values($1,'b04-fail@bayflow.example.test')",[user(98)]);
  await asUser(db,98);
  await expectSqlState(db,'select public.save_shop(null,$1)',[{...settings,workingHours:{mon:[['18:00','09:00']]}}],'22023');
  assert.equal((await db.query('select * from public.profiles where id=$1',[user(98)])).rowCount,0);
  assert.equal((await db.query('select * from public.shop_memberships where user_id=$1',[user(98)])).rowCount,0);
}));

test('B04 anonymous and staff cannot create shops; foreign owners cannot edit', () => withDatabase(async db => {
  await asUser(db,null,'anon');
  await expectSqlState(db,'select public.save_shop(null,$1)',[settings],'42501');
  for (const actor of [11,12,13,14]) {
    await asUser(db,actor);
    await expectSqlState(db,'select public.save_shop(null,$1)',[settings],'42501');
    await expectSqlState(db,update,[shop(1),{name:'Spoof'}],'42501');
  }
  await asUser(db,1);
  await expectSqlState(db,update,[shop(2),{name:'Spoof'}],'42501');
}));

test('B04 slot generation is repeatable, UTC-correct, within 14 days and excludes lunch/closed days', () => withDatabase(async db => {
  await asUser(db,1);
  const s=await create(db,{...settings,workingHours:{...hours,sun:[]}});
  const first=(await db.query('select * from public.appointment_slots where shop_id=$1 order by starts_at',[s.id])).rows;
  assert.ok(first.length>=55 && first.length<=60); // 12 open dates * five slots, less any elapsed today.
  for(const row of first) {
    const local=new Date(new Date(row.starts_at).getTime()+5*3600000);
    assert.notEqual(local.getUTCDay(),0);
    assert.ok([9,10,11,13,14].includes(local.getUTCHours()));
    assert.equal(new Date(row.ends_at)-new Date(row.starts_at),3600000);
    assert.equal(row.capacity,2);
    assert.ok(new Date(row.starts_at)>new Date());
    const today = new Date(new Date().getTime()+5*3600000).toISOString().slice(0,10);
    const days=(Date.parse(local.toISOString().slice(0,10))-Date.parse(today))/86400000;
    assert.ok(days>=0 && days<14);
  }
  await db.query(update,[s.id,{name:s.name}]);
  assert.deepEqual((await db.query('select id from public.appointment_slots where shop_id=$1 order by starts_at',[s.id])).rows.map(r=>r.id),first.map(r=>r.id));
}));

test('B04 timezone grid omits nonexistent DST hours instead of shifting them', () => withDatabase(async db => {
  const result=await db.query(`select starts_at,ends_at from private.shop_slot_grid($1,'America/New_York',60,'2026-03-08')
    where (starts_at at time zone 'America/New_York')::date='2026-03-08'`,[{sun:[['01:00','04:00']]}]);
  assert.equal(result.rowCount,1);
  assert.equal(new Date(result.rows[0].starts_at).toISOString(),'2026-03-08T07:00:00.000Z');
  assert.equal(new Date(result.rows[0].ends_at).toISOString(),'2026-03-08T08:00:00.000Z');
}));

test('B04 strict SQL settings reject malformed hours, timezone, authority fields and invalid numbers', () => withDatabase(async db => {
  await asUser(db,1);
  for(const patch of [
    {workingHours:{monday:[]}}, {workingHours:{mon:[['09:00','12:00'],['11:00','13:00']]}},
    {workingHours:{mon:[['22:00','02:00']]}}, {workingHours:{mon:[['9:00','12:00']]}},
    {workingHours:{mon:null}}, {workingHours:null}, {timezone:'No/Such_Zone'},
    {slotCapacity:0}, {slotCapacity:1.5}, {slotDurationMinutes:0}, {slotCapacity:null},
    {active:'false'}, {owner_user_id:user(2)}, {slug:'spoof'}, {phone:'abc'}, {name:''},
  ]) await expectSqlState(db,'select public.save_shop(null,$1)',[{...settings,...patch}],'22023');
}));

test('B04 partial settings retain existing values and closed hours remove unbooked future slots', () => withDatabase(async db => {
  await asUser(db,1);
  const s=await create(db);
  const result=(await db.query(update,[s.id,{city:'Islamabad',workingHours:{}}])).rows[0].shop;
  assert.equal(result.city,'Islamabad'); assert.equal(result.name,s.name); assert.equal(result.slotCapacity,2);
  assert.equal((await db.query('select * from public.appointment_slots where shop_id=$1',[s.id])).rowCount,0);
}));

test('B04 services stay shop-scoped and deactivate without deleting history', () => withDatabase(async db => {
  await asUser(db,1);
  const s=await create(db);
  const createService='select public.save_service($1,null,$2) as s';
  const service=(await db.query(createService,[s.id,{name:'Inspection',durationMinutes:60,basePricePkr:6500}])).rows[0].s;
  assert.equal(service.shopId,s.id); assert.equal(service.basePricePkr,6500);
  assert.equal((await db.query('select * from public.public_services where shop_id=$1',[s.id])).rowCount,1);
  const edited=(await db.query('select public.save_service($1,$2,$3) as s',[s.id,service.id,{active:false,basePricePkr:null}])).rows[0].s;
  assert.equal(edited.active,false); assert.equal(edited.basePricePkr,null);
  assert.equal((await db.query('select * from public.public_services where shop_id=$1',[s.id])).rowCount,0);
  assert.equal((await db.query('select * from public.services where id=$1',[service.id])).rowCount,1);
  await expectSqlState(db,createService,[shop(2),{name:'Spoof',durationMinutes:60}],'42501');
  await expectSqlState(db,'select public.save_service($1,$2,$3)',[shop(1),service.id,{active:false}],'P0002');
  for(const value of [{name:'Invalid',durationMinutes:0},{name:'Invalid',durationMinutes:60,basePricePkr:-1},
    {name:'Invalid',durationMinutes:60,shopId:shop(2)},{}])
    await expectSqlState(db,createService,[s.id,value],'22023');
  await asUser(db,11);
  await expectSqlState(db,createService,[shop(1),{name:'Spoof',durationMinutes:60}],'42501');
}));

async function reserve(db, s, count=1) {
  await db.query('reset role');
  const a=(await db.query('select * from public.appointment_slots where shop_id=$1 order by starts_at limit 1',[s.id])).rows[0];
  for(let n=0;n<count;n++) await db.query(`insert into public.bookings(id,shop_id,customer_id,vehicle_id,slot_id,status)
    values($1,$2,$3,$4,$5,'PENDING')`,[id('75',n+1),s.id,user(3),id('60',1),a.id]);
  return a;
}
test('B04 public capacity counts all non-cancelled bookings without exposing their identities', () => withDatabase(async db => {
  await asUser(db,1); const s=await create(db); const a=await reserve(db,s,2);
  await asUser(db,null,'anon');
  const read=async()=> (await db.query('select * from public.public_appointment_slots where id=$1',[a.id])).rows[0];
  assert.equal((await read()).capacity_remaining,0);
  assert.deepEqual(Object.keys(await read()).sort(),['id','shop_id','starts_at','ends_at','capacity','capacity_remaining','local_date'].sort());
  await expectSqlState(db,'select * from public.bookings',[],'42501');
  await db.query('reset role');
  await db.query("update public.bookings set status='CANCELLED' where id=$1",[id('75',1)]);
  await asUser(db,null,'anon'); assert.equal((await read()).capacity_remaining,1);
  await db.query('reset role');
  await db.query("update public.bookings set status='COMPLETED',completed_at=now() where id=$1",[id('75',2)]);
  await asUser(db,null,'anon'); assert.equal((await read()).capacity_remaining,1);
}));

test('B04 booked future times cannot be removed, shifted or reduced below occupancy', () => withDatabase(async db => {
  await asUser(db,1); const s=await create(db); const a=await reserve(db,s,2);
  await asUser(db,1);
  for(const patch of [{workingHours:{}},{slotDurationMinutes:30},{slotCapacity:1},{timezone:'UTC'}])
    await expectSqlState(db,update,[s.id,patch],'23514');
  const changed=(await db.query(update,[s.id,{name:'Changed name',slotCapacity:3}])).rows[0].shop;
  assert.equal(changed.name,'Changed name'); assert.equal(changed.slotCapacity,3);
  assert.equal((await db.query('select capacity from public.appointment_slots where id=$1',[a.id])).rows[0].capacity,3);
}));

test('B04 unpublished shops hide detail/services/slots; owner membership remains active', () => withDatabase(async db => {
  await asUser(db,1); const s=await create(db);
  await db.query(update,[s.id,{active:false}]);
  assert.equal((await db.query('select * from public.shop_memberships where shop_id=$1 and active',[s.id])).rowCount,1);
  await asUser(db,null,'anon');
  for(const view of ['public_shops','public_services','public_appointment_slots'])
    assert.equal((await db.query(`select * from public.${view} where ${view==='public_shops'?'id':'shop_id'}=$1`,[s.id])).rowCount,0);
}));

test('B04 helper and wrapper grants preserve the private boundary', () => withDatabase(async db => {
  const names=['validate_working_hours','shop_slot_grid','shop_dto','save_shop_impl','save_service_impl','save_shop','save_service'];
  const rows=(await db.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as user_exec
    from pg_proc p where p.proname=any($1)`,[names])).rows;
  assert.equal(rows.length,7);
  for(const row of rows) {
    assert.ok(row.proconfig.includes('search_path=""')); assert.equal(row.anon_exec,false);
    assert.equal(row.user_exec,['save_shop','save_service','save_shop_impl','save_service_impl'].includes(row.proname));
    assert.equal(row.prosecdef,['save_shop_impl','save_service_impl'].includes(row.proname));
  }
}));

test('MT03 keeps onboarding shops private until hours, services and every required role exist', () => withDatabase(async db => {
  await asUser(db,1);
  const s=await create(db,{...settings,active:false});
  assert.equal(s.active,false);
  await expectSqlState(db,update,[s.id,{active:true}],'BF001');
  await db.query('select public.save_service($1,null,$2)',[s.id,{name:'Inspection',durationMinutes:60,basePricePkr:1500}]);
  await expectSqlState(db,update,[s.id,{active:true}],'BF001');
  await db.query('reset role');
  for(const [number,role] of [[11,'SA'],[12,'TECHNICIAN'],[13,'PARTS'],[14,'QC']])
    await db.query('insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,$3)',[s.id,user(number),role]);
  await asUser(db,1);
  const published=(await db.query(update,[s.id,{active:true}])).rows[0].shop;
  assert.equal(published.active,true);
  await asUser(db,null,'anon');
  assert.equal((await db.query('select id from public.public_shops where id=$1',[s.id])).rowCount,1);
}));
