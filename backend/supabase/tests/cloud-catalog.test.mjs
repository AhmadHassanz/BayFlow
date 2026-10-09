import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures, fixtureId } from './support/cloud-fixtures.mjs';

const frontend = fileURLToPath(new URL('../../../frontend/',import.meta.url));
const require = createRequire(`${frontend}/package.json`);
const { createServerClient } = require('@supabase/ssr');
const origin='http://localhost:3105', run=randomUUID(), bookingId=randomUUID();
const actors={}, clients={}, created=[];
let cloud,fixtures,server,key,shopA,shopA2,shopB,serviceA,date;
const names=[`B04 ${run} A`,`B04 ${run} A2`,`B04 ${run} B`];
const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','12:00'],['13:00','15:00']]]));
const input={city:'Lahore',address:'Marked B04 Cloud test fixture',phone:'+920000000000',workingHours:hours,slotCapacity:2};
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
    const first=cookie.split(';')[0],i=first.indexOf('=');
    const name=first.slice(0,i),value=decodeURIComponent(first.slice(i+1));
    if(value) ctx.jar.set(name,value); else ctx.jar.delete(name);
  }
  return {status:response.status,data:await response.json(),headers:response.headers};
}
async function createShop(name,actor) {
  const response=await request('/api/v1/owner/shops',actor,'POST',{...input,name});
  assert.equal(response.status,201); created.push(response.data.data);
  return response.data.data;
}
before(async()=>{
  cloud=await connectCloud();
  const versions=await cloud.query('select version from supabase_migrations.schema_migrations');
  if(!versions.some(row=>row.version==='20261009121005'))
    throw new Error('B04 migration is pending approval/application. No Cloud fixtures were changed.');
  const keys=await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key=keys.find(k=>k.type==='publishable')?.api_key??keys.find(k=>k.name==='anon')?.api_key;
  if(!key) throw new Error('The public Cloud test key is unavailable.');
  await provisionIdentities(cloud,actors); fixtures=buildFixtures(actors); await provisionRows(cloud,fixtures);
  for(const name of ['customer-a','customer-b','advisor-a']) {
    clients[name]=context();
    assert.equal((await clients[name].client.auth.setSession({access_token:actors[name].token,refresh_token:actors[name].refreshToken})).error,null);
  }
  // Deliberately no Admin key in Next.js: B04 operations use anon or the user JWT.
  server=spawn(process.execPath,[`${frontend}/node_modules/next/dist/bin/next`,'start','-p','3105'],{
    cwd:frontend,windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,NEXT_PUBLIC_SITE_URL:origin,SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},
  });
  for(let i=0;i<60;i++) {
    try { if((await request('/api/v1/me')).status===401) return; } catch { /* starting */ }
    if(server.exitCode!==null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Next.js did not become ready.');
},{timeout:240000});

after(async()=>{
  const errors=[];
  try {
    if(cloud && actors['customer-a'] && actors['customer-b']) {
      // Recover uncertain creates by exact per-run names and marked owner IDs.
      const ownerIds=[actors['customer-a'].id,actors['customer-b'].id].map(sqlLiteral).join(',');
      const named=names.map(sqlLiteral).join(',');
      const result=await cloud.query(`begin;
        update public.bookings set status='CANCELLED' where id=${sqlLiteral(bookingId)}
          and shop_id in(select id from public.shops where name in(${named}) and owner_user_id in(${ownerIds}));
        update public.shops set active=false where name in(${named}) and owner_user_id in(${ownerIds});
        commit; select count(*)::integer as active from public.shops where name in(${named}) and owner_user_id in(${ownerIds}) and active;`);
      assert.equal(result[0].active,0);
    }
  } catch(error) { errors.push(error); }
  try { if(cloud && Object.keys(actors).length) await deactivateFixtures(cloud,actors,fixtures??null); }
  catch(error) { errors.push(error); }
  finally { if(server) server.kill(); }
  if(errors.length) throw new AggregateError(errors,'B04 fixture cleanup failed; inspect marked test records.');
},{timeout:180000});

test('B04 anonymous create is 401 and staff cannot create or edit shops',async()=>{
  assert.equal((await request('/api/v1/owner/shops',undefined,'POST',{...input,name:names[0]})).status,401);
  assert.equal((await request('/api/v1/owner/shops','advisor-a','POST',{...input,name:names[0]})).status,403);
  assert.equal((await request(`/api/v1/owner/shops/${fixtureId(1,1)}`,'advisor-a','PATCH',{name:'Spoof'})).status,403);
});
test('B04 authenticated identity creates two separate shops with OWNER memberships',async()=>{
  shopA=await createShop(names[0],'customer-a'); shopA2=await createShop(names[1],'customer-a'); shopB=await createShop(names[2],'customer-b');
  assert.notEqual(shopA.id,shopA2.id); assert.notEqual(shopA.slug,shopA2.slug); assert.equal(shopA.timezone,'Asia/Karachi');
  const me=await request('/api/v1/me','customer-a');
  for(const shop of [shopA,shopA2]) assert.ok(me.data.data.memberships.some(m=>m.shopId===shop.id&&m.role==='OWNER'&&m.active));
});
test('B04 public list/filter and both detail routes expose the correct shop only',async()=>{
  const list=await request(`/api/v1/shops?q=${encodeURIComponent(`B04 ${run}`)}&city=Lahore`);
  assert.equal(list.status,200); assert.equal(list.data.data.total,3);
  for(const s of created) {
    const byId=await request(`/api/v1/shops/${s.id}`), bySlug=await request(`/api/v1/shops/by-slug/${s.slug}`);
    assert.equal(byId.status,200); assert.equal(bySlug.status,200);
    assert.equal(byId.data.data.id,s.id); assert.equal(bySlug.data.data.id,s.id);
    for(const response of [byId,bySlug]) {
      assert.ok(!Object.hasOwn(response.data.data,'ownerUserId')); assert.ok(!Object.hasOwn(response.data.data,'owner_user_id'));
      assert.match(response.headers.get('cache-control'),/no-store/);
    }
  }
});
test('B04 service create/edit/deactivate are owner-only and shop-scoped',async()=>{
  const response=await request(`/api/v1/shops/${shopA.id}/services`,'customer-a','POST',{name:'B04 inspection',durationMinutes:60,basePricePkr:6500});
  assert.equal(response.status,201); serviceA=response.data.data;
  assert.equal((await request(`/api/v1/shops/${shopB.id}/services`,'customer-a','POST',{name:'Spoof',durationMinutes:60})).status,403);
  assert.equal((await request(`/api/v1/shops/${shopB.id}/services/${serviceA.id}`,'customer-b','PATCH',{active:false})).status,404);
  assert.equal((await request(`/api/v1/shops/${shopA.id}/services`)).data.data.items.length,1);
  assert.equal((await request(`/api/v1/shops/${shopA2.id}/services`)).data.data.items.length,0);
  const edited=await request(`/api/v1/shops/${shopA.id}/services/${serviceA.id}`,'customer-a','PATCH',{basePricePkr:null,active:false});
  assert.equal(edited.status,200); assert.equal(edited.data.data.basePricePkr,null);
  assert.equal((await request(`/api/v1/shops/${shopA.id}/services`)).data.data.items.length,0);
});
test('B04 generated slots follow local shifts and repeated saves preserve IDs',async()=>{
  const next=new Date(); next.setUTCDate(next.getUTCDate()+1); date=next.toISOString().slice(0,10);
  const first=await request(`/api/v1/shops/${shopA.id}/slots?date=${date}`);
  assert.equal(first.status,200); assert.equal(first.data.data.length,5);
  assert.deepEqual(first.data.data.map(a=>new Date(a.startsAt).getUTCHours()),[4,5,6,8,9]);
  assert.ok(first.data.data.every(a=>a.capacity===2&&a.capacityRemaining===2));
  assert.equal((await request(`/api/v1/owner/shops/${shopA.id}`,'customer-a','PATCH',{workingHours:hours})).status,200);
  const repeated=await request(`/api/v1/shops/${shopA.id}/slots?date=${date}`);
  assert.deepEqual(repeated.data.data.map(a=>a.id),first.data.data.map(a=>a.id));
});
test('B04 capacity is server-counted; conflicting edits fail atomically',async()=>{
  const slots=(await request(`/api/v1/shops/${shopA.id}/slots?date=${date}`)).data.data;
  await cloud.query(`insert into public.bookings(id,shop_id,customer_id,vehicle_id,slot_id,status)
    values(${sqlLiteral(bookingId)},${sqlLiteral(shopA.id)},${sqlLiteral(actors['customer-a'].id)},
      ${sqlLiteral(fixtureId(5,1))},${sqlLiteral(slots[0].id)},'PENDING'); select true as ready;`);
  const current=await request(`/api/v1/shops/${shopA.id}/slots?date=${date}`);
  assert.equal(current.data.data[0].capacityRemaining,1);
  assert.ok(!JSON.stringify(current.data).includes(bookingId));
  assert.equal((await request(`/api/v1/owner/shops/${shopA.id}`,'customer-a','PATCH',{workingHours:{}})).status,409);
  assert.equal((await request(`/api/v1/owner/shops/${shopB.id}`,'customer-a','PATCH',{name:'Spoof'})).status,403);
  assert.equal((await request(`/api/v1/owner/shops/${shopA.id}`,'customer-a','PATCH',{slotCapacity:0})).status,400);
  await cloud.query(`update public.bookings set status='CANCELLED' where id=${sqlLiteral(bookingId)}; select true as cancelled;`);
  assert.equal((await request(`/api/v1/shops/${shopA.id}/slots?date=${date}`)).data.data[0].capacityRemaining,2);
});
test('B04 closed days and unpublished shops return no public catalog/slots',async()=>{
  assert.equal((await request(`/api/v1/owner/shops/${shopA2.id}`,'customer-a','PATCH',{workingHours:{}})).status,200);
  assert.deepEqual((await request(`/api/v1/shops/${shopA2.id}/slots?date=${date}`)).data.data,[]);
  assert.equal((await request(`/api/v1/owner/shops/${shopA2.id}`,'customer-a','PATCH',{active:false})).status,200);
  for(const path of [`/api/v1/shops/${shopA2.id}`,`/api/v1/shops/by-slug/${shopA2.slug}`,
    `/api/v1/shops/${shopA2.id}/services`,`/api/v1/shops/${shopA2.id}/slots?date=${date}`])
    assert.equal((await request(path)).status,404);
});
