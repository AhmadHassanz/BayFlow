import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures } from './support/cloud-fixtures.mjs';

// Manual/operator-run only. No Cloud migration is applied by this suite.
const frontend=fileURLToPath(new URL('../../../frontend/',import.meta.url));
const require=createRequire(`${frontend}/package.json`);
const {createServerClient}=require('@supabase/ssr');
const origin='http://localhost:3107', run=randomUUID(), actors={}, clients={};
const name=`B06 ${run}`;
const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]));
let cloud,fixtures,server,key,shop,service,slot,booking,confirmedInput,assignedInput;
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
  if(ctx) for(const cookie of response.headers.getSetCookie()) {
    const first=cookie.split(';')[0],i=first.indexOf('='),cookieName=first.slice(0,i),value=decodeURIComponent(first.slice(i+1));
    if(value) ctx.jar.set(cookieName,value); else ctx.jar.delete(cookieName);
  }
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const action=(action,expectedVersion,payload={})=>({action,expectedVersion,payload,idempotencyKey:randomUUID()});
async function postAction(input,actor='advisor-a') {
  return request(`/api/v1/bookings/${booking.id}/actions`,actor,'POST',input);
}
before(async()=>{
  cloud=await connectCloud();
  const versions=await cloud.query('select version from supabase_migrations.schema_migrations');
  if(!versions.some(row=>row.version==='20261009151303'))
    throw new Error('Apply the reviewed B06 migration manually first. No Cloud fixtures were changed.');
  const keys=await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key=keys.find(k=>k.type==='publishable')?.api_key??keys.find(k=>k.name==='anon')?.api_key;
  if(!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud,actors); fixtures=buildFixtures(actors); await provisionRows(cloud,fixtures);
  for(const actor of ['owner-a','customer-a','customer-b','advisor-a','technician-a','technician-b','outsider']) {
    clients[actor]=context();
    assert.equal((await clients[actor].client.auth.setSession({access_token:actors[actor].token,refresh_token:actors[actor].refreshToken})).error,null);
  }
  server=spawn(process.execPath,[`${frontend}/node_modules/next/dist/bin/next`,'start','-p','3107'],{
    cwd:frontend,windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,NEXT_PUBLIC_SITE_URL:origin,SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},
  });
  let ready=false;
  for(let i=0;i<60;i++) {
    try { if((await request('/api/v1/me')).status===401) {ready=true;break;} } catch { /* starting */ }
    if(server.exitCode!==null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Build the frontend before Cloud action verification.');
  const created=await request('/api/v1/owner/shops','owner-a','POST',{name,city:'Lahore',address:'Marked B06 Cloud fixture',
    phone:'+920000000000',workingHours:hours,slotCapacity:3});
  assert.equal(created.status,201); shop=created.data.data;
  const createdService=await request(`/api/v1/shops/${shop.id}/services`,'owner-a','POST',{name:'B06 inspection',durationMinutes:60});
  assert.equal(createdService.status,201); service=createdService.data.data;
  await cloud.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-a'].id)},'SA',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-a'].id)},'TECHNICIAN',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-b'].id)},'TECHNICIAN',true); select true as team_ready;`);
  const tomorrow=new Date(Date.now()+5*3600000); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const slots=await request(`/api/v1/shops/${shop.id}/slots?date=${tomorrow.toISOString().slice(0,10)}`);
  assert.equal(slots.status,200); slot=slots.data.data[0]; assert.ok(slot?.id);
  const made=await request('/api/v1/bookings','customer-a','POST',{shopId:shop.id,slotId:slot.id,serviceIds:[service.id],symptomNotes:'',
    vehicle:{registrationPlate:`B06-${run.slice(0,8)}`,make:'Honda',model:'Civic',year:2016},idempotencyKey:randomUUID()});
  assert.equal(made.status,201); booking=made.data.data;
},{timeout:240000});
after(async()=>{
  const errors=[];
  try {
    if(cloud && actors['owner-a']) {
      const owner=sqlLiteral(actors['owner-a'].id), named=sqlLiteral(name);
      const scope=`select id from public.shops where name=${named} and owner_user_id=${owner}`;
      const result=await cloud.query(`begin;
        update public.bookings set status='CANCELLED' where shop_id in (${scope}) and status not in ('COMPLETED','CANCELLED');
        update public.shop_memberships set active=false where shop_id in (${scope}) and role<>'OWNER';
        update public.shops set active=false where id in (${scope});
        commit; select (select count(*)::integer from public.shops where id in (${scope}) and active) active_shops;`);
      assert.equal(result[0].active_shops,0);
    }
  } catch(error) {errors.push(error);}
  try { if(cloud && Object.keys(actors).length) await deactivateFixtures(cloud,actors,fixtures??null); }
  catch(error) {errors.push(error);}
  finally {if(server) server.kill();}
  if(errors.length) throw new AggregateError(errors,'B06 fixture cleanup failed; inspect exact marked records.');
},{timeout:180000});

test('B06 unauthenticated action is denied and direct anonymous RPC is not executable',async()=>{
  assert.equal((await request(`/api/v1/bookings/${booking.id}/actions`,undefined,'POST',
    action('CONFIRM_BOOKING',0))).status,401);
  const anonymous=await cloud.request('/rest/v1/rpc/apply_booking_action',{method:'POST',body:{input:{bookingId:booking.id,...action('CONFIRM_BOOKING',0)}}});
  assert.ok([401,403].includes(anonymous.status));
});
test('B06 confirms, assigns and starts inspection with authoritative versions and history',async()=>{
  confirmedInput=action('CONFIRM_BOOKING',0);
  let response=await postAction(confirmedInput,'advisor-a');
  assert.equal(response.status,201); assert.equal(response.data.data.status,'CONFIRMED'); assert.equal(response.data.data.stateVersion,1);
  assignedInput=action('ASSIGN_TECHNICIAN',1,{technicianUserId:actors['technician-a'].id});
  response=await postAction(assignedInput,'advisor-a');
  assert.equal(response.status,201); assert.equal(response.data.data.status,'ASSIGNED');
  response=await postAction(action('START_INSPECTION',2),'technician-a');
  assert.equal(response.status,201); assert.equal(response.data.data.status,'INSPECTING');
  const history=await cloud.query(`select action,from_status,to_status from public.booking_history where booking_id=${sqlLiteral(booking.id)} order by created_at,id`);
  assert.deepEqual(history.map(row=>row.action).slice(-3),['CONFIRM_BOOKING','ASSIGN_TECHNICIAN','START_INSPECTION']);
});
test('B06 stale versions, wrong actors and wrong states return safe errors',async()=>{
  let response=await postAction(action('CONFIRM_BOOKING',0),'advisor-a');
  assert.equal(response.status,409); assert.equal(response.data.error.code,'STATE_CONFLICT');
  response=await postAction(action('START_INSPECTION',3),'technician-b');
  assert.ok([404,403].includes(response.status));
  response=await postAction(action('ASSIGN_TECHNICIAN',3,{technicianUserId:actors['technician-b'].id}),'advisor-a');
  assert.equal(response.status,422); assert.equal(response.data.error.code,'ACTION_NOT_ALLOWED');
});
test('B06 detail and lists are scoped to customer, SA and assigned technician',async()=>{
  for(const [actor,visible] of [['customer-a',true],['advisor-a',true],['technician-a',true],['technician-b',false],['customer-b',false]]) {
    const response=await request(`/api/v1/bookings/${booking.id}`,actor);
    assert.equal(response.status,visible?200:404,actor);
  }
  assert.ok((await request('/api/v1/me/bookings','customer-a')).data.data.some(row=>row.id===booking.id));
  assert.ok((await request(`/api/v1/shops/${shop.id}/bookings?assignee=mine`,'technician-a')).data.data.items.some(row=>row.id===booking.id));
  assert.equal((await request(`/api/v1/shops/${shop.id}/bookings`,'technician-b')).data.data.items.length,0);
});
test('B06 cancellation before repair is terminal and idempotency mismatches conflict',async()=>{
  const made=await request('/api/v1/bookings','customer-a','POST',{shopId:shop.id,slotId:slot.id,serviceIds:[service.id],symptomNotes:'',
    vehicle:{registrationPlate:`B06-C-${run.slice(0,6)}`,make:'Honda',model:'City',year:2018},idempotencyKey:randomUUID()});
  assert.equal(made.status,201);
  const previous=booking; booking=made.data.data;
  const cancel=action('CANCEL_BOOKING',0,{reason:'Customer changed plans'});
  let response=await postAction(cancel,'customer-a');
  assert.equal(response.status,201); assert.equal(response.data.data.status,'CANCELLED');
  response=await postAction(cancel,'customer-a');
  assert.equal(response.status,200); assert.equal(response.data.data.status,'CANCELLED');
  response=await postAction({...cancel,payload:{reason:'Different reason'}},'customer-a');
  assert.equal(response.status,409); assert.equal(response.data.error.code,'IDEMPOTENCY_CONFLICT');
  response=await postAction(action('CONFIRM_BOOKING',1),'advisor-a');
  assert.equal(response.status,422);
  booking=previous;
});
