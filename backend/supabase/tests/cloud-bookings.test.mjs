import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures, fixtureId } from './support/cloud-fixtures.mjs';

// Manual/operator-run only. No Cloud migration is applied by this suite.
const frontend=fileURLToPath(new URL('../../../frontend/',import.meta.url));
const require=createRequire(`${frontend}/package.json`);
const {createServerClient}=require('@supabase/ssr');
const origin='http://localhost:3106', run=randomUUID(), actors={}, clients={};
const names=[`B05 ${run} A`,`B05 ${run} B`];
const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]));
let cloud,fixtures,server,key,shop,other,service,slots,successful;
function context() {
  const jar=new Map();
  const client=createServerClient(`https://${cloud.ref}.supabase.co`,key,{cookies:{
    getAll:()=>[...jar].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name)),
  }});
  return {client,jar};
}
async function request(path,actor,method='GET',body) {
  const ctx=clients[actor];
  const response=await fetch(`${origin}${path}`,{method,headers:{
    Cookie:ctx?[...ctx.jar].map(([n,v])=>`${n}=${v}`).join('; '):'',
    ...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),
  },body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  // Access/refresh cookie changes are retained; no tokens or raw response logged.
  if(ctx) for(const cookie of response.headers.getSetCookie()) {
    const first=cookie.split(';')[0],i=first.indexOf('='),name=first.slice(0,i),value=decodeURIComponent(first.slice(i+1));
    if(value) ctx.jar.set(name,value); else ctx.jar.delete(name);
  }
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const post=(input,actor='customer-a')=>request('/api/v1/bookings',actor,'POST',input);
function payload(index=0) {
  return {shopId:shop.id,slotId:slots[index].id,serviceIds:[service.id],symptomNotes:'',
    vehicle:{registrationPlate:`B05-${run.slice(0,8)}`,make:'Honda',model:'Civic',year:2016},idempotencyKey:randomUUID()};
}
async function effects() {
  return (await cloud.query(`select
    (select count(*)::integer from public.bookings where shop_id=${sqlLiteral(shop.id)}) bookings,
    (select count(*)::integer from public.booking_services where shop_id=${sqlLiteral(shop.id)}) services,
    (select count(*)::integer from public.booking_history where shop_id=${sqlLiteral(shop.id)}) history,
    (select count(*)::integer from public.notifications where shop_id=${sqlLiteral(shop.id)}) notices,
    (select count(*)::integer from private.booking_receipts where payload->>'shopId'=${sqlLiteral(shop.id)}) receipts,
    (select count(*)::integer from public.vehicles where customer_id in (${['customer-a','customer-b','outsider'].map(n=>sqlLiteral(actors[n].id)).join(',')}) vehicles;`))[0];
}
before(async()=>{
  cloud=await connectCloud();
  const versions=await cloud.query('select version from supabase_migrations.schema_migrations');
  if(!versions.some(row=>row.version==='20261009140203'))
    throw new Error('Apply the reviewed B05 migration manually first. No Cloud fixtures were changed.');
  const keys=await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key=keys.find(k=>k.type==='publishable')?.api_key??keys.find(k=>k.name==='anon')?.api_key;
  if(!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud,actors); fixtures=buildFixtures(actors); await provisionRows(cloud,fixtures);
  for(const name of ['owner-a','customer-a','customer-b','outsider','advisor-a','advisor-b']) {
    clients[name]=context();
    assert.equal((await clients[name].client.auth.setSession({access_token:actors[name].token,refresh_token:actors[name].refreshToken})).error,null);
  }
  server=spawn(process.execPath,[`${frontend}/node_modules/next/dist/bin/next`,'start','-p','3106'],{
    cwd:frontend,windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,NEXT_PUBLIC_SITE_URL:origin,SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},
  });
  let ready=false;
  for(let i=0;i<60;i++) {
    try { if((await request('/api/v1/me')).status===401) {ready=true;break;} } catch { /* starting */ }
    if(server.exitCode!==null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Build the frontend before Cloud booking verification.');
  const created=[];
  for(const name of names) {
    const response=await request('/api/v1/owner/shops','owner-a','POST',{name,city:'Lahore',address:'Marked B05 Cloud fixture',
      phone:'+920000000000',workingHours:hours,slotCapacity:2});
    assert.equal(response.status,201); created.push(response.data.data);
  }
  [shop,other]=created;
  const createdService=await request(`/api/v1/shops/${shop.id}/services`,'owner-a','POST',{name:'B05 inspection',durationMinutes:60});
  assert.equal(createdService.status,201); service=createdService.data.data;
  await cloud.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-a'].id)},'SA',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-b'].id)},'SA',false); select true as team_ready;`);
  const tomorrow=new Date(Date.now()+5*3600000); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const response=await request(`/api/v1/shops/${shop.id}/slots?date=${tomorrow.toISOString().slice(0,10)}`);
  assert.equal(response.status,200); slots=response.data.data; assert.equal(slots.length,9);
},{timeout:240000});
after(async()=>{
  const errors=[];
  try {
    if(cloud && actors['owner-a']) {
      const named=names.map(sqlLiteral).join(','), owner=sqlLiteral(actors['owner-a'].id);
      const scope=`select id from public.shops where name in (${named}) and owner_user_id=${owner}`;
      const result=await cloud.query(`begin;
        update public.bookings set status='CANCELLED' where shop_id in (${scope});
        update public.shop_memberships set active=false where shop_id in (${scope}) and role<>'OWNER';
        update public.shops set active=false where id in (${scope});
        commit; select
          (select count(*)::integer from public.shops where id in (${scope}) and active) active_shops,
          (select count(*)::integer from public.shop_memberships where shop_id in (${scope}) and role<>'OWNER' and active) active_staff;`);
      assert.equal(result[0].active_shops,0); assert.equal(result[0].active_staff,0);
    }
  } catch(error) {errors.push(error);}
  try { if(cloud && Object.keys(actors).length) await deactivateFixtures(cloud,actors,fixtures??null); }
  catch(error) {errors.push(error);}
  finally {if(server) server.kill();}
  if(errors.length) throw new AggregateError(errors,'B05 fixture cleanup failed; inspect exact marked records.');
},{timeout:180000});

test('B05 no session is 401; anonymous RPC/direct receipt access is denied',async()=>{
  assert.equal((await request('/api/v1/bookings',undefined,'POST',payload())).status,401);
  const anonymous=await cloud.request('/rest/v1/rpc/create_booking',{method:'POST',body:{input:payload()}});
  assert.ok([401,403].includes(anonymous.status));
  const receipt=await cloud.request('/rest/v1/booking_receipts?select=*',{token:actors['customer-a'].token});
  assert.equal(receipt.status,404);
  const grants=(await cloud.query(`select relrowsecurity,
    has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed
    from pg_class where oid='private.booking_receipts'::regclass;`))[0];
  assert.equal(grants.relrowsecurity,true); assert.equal(grants.allowed,false);
});
test('B05 known-service creation returns authoritative PENDING and exactly one complete set of effects',async()=>{
  const before=await effects(), input=payload(1), response=await post(input);
  assert.equal(response.status,201); successful={input,booking:response.data.data};
  assert.equal(successful.booking.status,'PENDING'); assert.equal(successful.booking.stateVersion,0);
  assert.equal(successful.booking.customerId,actors['customer-a'].id); assert.deepEqual(successful.booking.serviceIds,[service.id]);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const current=await effects();
  for(const name of ['bookings','services','history','notices','receipts','vehicles']) assert.equal(current[name]-before[name],1,name);
});
test('B05 concurrent successful retries and payload mismatches preserve all effects exactly once',async()=>{
  const before=await effects();
  const retries=await Promise.all(Array.from({length:5},()=>post(successful.input)));
  assert.ok(retries.every(r=>r.status===200&&r.data.data.id===successful.booking.id));
  const changed=await post({...successful.input,symptomNotes:'Different intent requires a new key.'});
  assert.equal(changed.status,409); assert.equal(changed.data.error.code,'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await effects(),before);
});
test('B05 parallel attempts above capacity yield exactly two 201s and six safe 409s',async()=>{
  const before=await effects();
  const results=await Promise.all(Array.from({length:8},(_,i)=>post(payload(),['customer-a','customer-b','outsider'][i%3])));
  assert.equal(results.filter(r=>r.status===201).length,2);
  const losers=results.filter(r=>r.status===409); assert.equal(losers.length,6);
  assert.ok(losers.every(r=>r.data.error.code==='SLOT_CONFLICT'&&r.data.data===null));
  const current=await effects();
  for(const name of ['bookings','services','history','notices','receipts']) assert.equal(current[name]-before[name],2,name);
  const vehicleIds=new Set(results.filter(r=>r.status===201).map(r=>r.data.data.vehicleId));
  vehicleIds.delete(successful.booking.vehicleId);
  assert.equal(current.vehicles-before.vehicles,vehicleIds.size,'Only winning requests may create vehicles.');
});
test('B05 symptom-only booking is visible to its customer/SA; foreign customer and SA cannot read it',async()=>{
  const input={...payload(2),serviceIds:[],symptomNotes:'Brakes squeak when stopping. Not sure why.'};
  const response=await post(input); assert.equal(response.status,201); const b=response.data.data;
  assert.deepEqual(b.serviceIds,[]); assert.equal(b.symptomNotes,input.symptomNotes);
  for(const name of ['customer-a','advisor-a','customer-b','advisor-b']) {
    const result=await cloud.requireSuccess(`/rest/v1/bookings?id=eq.${b.id}&select=id,status`,{token:actors[name].token});
    assert.equal(result.length,['customer-a','advisor-a'].includes(name)?1:0,name);
  }
  const notices=await cloud.requireSuccess(`/rest/v1/notifications?booking_id=eq.${b.id}&select=user_id,type`,{token:actors['advisor-a'].token});
  assert.deepEqual(notices,[{user_id:actors['advisor-a'].id,type:'NEW_BOOKING'}]);
  const allNotices=await cloud.query(`select user_id from public.notifications where booking_id=${sqlLiteral(b.id)}`);
  assert.equal(allNotices.length,1,'Inactive SA receives no notice.');
});
test('B05 foreign/missing IDs, vehicle injection and detail changes fail without side effects',async()=>{
  const before=await effects(), input=payload(3);
  for(const [patch,status] of [[{slotId:randomUUID()},404],[{shopId:other.id},404],
    [{slotId:fixtureId(4,2)},404],[{serviceIds:[fixtureId(3,2)]},400],
    [{serviceIds:[randomUUID()]},400],[{vehicle:{...input.vehicle,id:fixtureId(5,2)}},400],
    [{customerId:actors['customer-b'].id},400],[{status:'COMPLETED'},400],
    [{vehicle:{...input.vehicle,model:'Changed'}},409]]) {
    assert.equal((await post({...input,...patch})).status,status);
  }
  assert.deepEqual(await effects(),before);
});
test('B05 unpublished, closed, elapsed, out-of-horizon and configuration-mismatched slots reject atomically',async()=>{
  const input=payload(3), before=await effects(), slot=slots[3];
  const patches=[
    [`update public.shops set active=false where id=${sqlLiteral(shop.id)}`,404],
    [`update public.shops set working_hours='{}' where id=${sqlLiteral(shop.id)}`,409],
    [`update public.appointment_slots set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=${sqlLiteral(slot.id)}`,409],
    [`update public.appointment_slots set starts_at=starts_at+interval '15 days',ends_at=ends_at+interval '15 days' where id=${sqlLiteral(slot.id)}`,409],
    [`update public.appointment_slots set capacity=3 where id=${sqlLiteral(slot.id)}`,409],
  ];
  try {
    for(const [sql,status] of patches) {
      await cloud.query(`${sql}; select true as patched;`);
      assert.equal((await post(input)).status,status);
      await cloud.query(`begin; update public.shops set active=true,working_hours=${sqlLiteral(hours)} where id=${sqlLiteral(shop.id)};
        update public.appointment_slots set starts_at=${sqlLiteral(slot.startsAt)},ends_at=${sqlLiteral(slot.endsAt)},capacity=2
          where id=${sqlLiteral(slot.id)}; commit; select true as restored;`);
    }
    assert.deepEqual(await effects(),before);
  } finally {
    await cloud.query(`begin; update public.shops set active=true,working_hours=${sqlLiteral(hours)} where id=${sqlLiteral(shop.id)};
      update public.appointment_slots set starts_at=${sqlLiteral(slot.startsAt)},ends_at=${sqlLiteral(slot.endsAt)},capacity=2
        where id=${sqlLiteral(slot.id)}; commit; select true as restored;`);
  }
});
test('B05 a foreign plate creates only an actor-owned vehicle and preserves the other vehicle',async()=>{
  const original=(await cloud.query(`select * from public.vehicles where id=${sqlLiteral(fixtureId(5,2))}`))[0];
  const input={...payload(4),vehicle:{registrationPlate:original.registration_plate,make:original.make,model:original.model,
    year:original.year,color:original.color,mileageKm:original.mileage}};
  const response=await post(input); assert.equal(response.status,201);
  assert.notEqual(response.data.data.vehicleId,original.id);
  assert.deepEqual((await cloud.query(`select * from public.vehicles where id=${sqlLiteral(original.id)}`))[0],original);
  assert.equal((await cloud.query(`select customer_id from public.vehicles where id=${sqlLiteral(response.data.data.vehicleId)}`))[0].customer_id,actors['customer-a'].id);
});
test('B05 successful replay survives publication changes and returns current authoritative state',async()=>{
  const before=await effects();
  await cloud.query(`begin; update public.shops set active=false where id=${sqlLiteral(shop.id)};
    update public.bookings set status='CONFIRMED',state_version=1 where id=${sqlLiteral(successful.booking.id)};
    commit; select true as updated;`);
  const response=await post(successful.input);
  assert.equal(response.status,200); assert.equal(response.data.data.status,'CONFIRMED'); assert.equal(response.data.data.stateVersion,1);
  assert.deepEqual(await effects(),before);
});
