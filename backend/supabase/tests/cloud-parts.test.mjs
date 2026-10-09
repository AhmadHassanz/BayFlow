import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures } from './support/cloud-fixtures.mjs';

const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const require = createRequire(`${frontend}/package.json`);
const { createServerClient } = require('@supabase/ssr');
const origin = 'http://localhost:3109', run = randomUUID(), actors = {}, clients = {};
const name = `B08 ${run}`;
const hours = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day => [day, [['09:00','18:00']]]));
let cloud, fixtures, server, key, shop, service, slot, booking, partId;
function context() {
  const jar = new Map();
  const client = createServerClient(`https://${cloud.ref}.supabase.co`, key, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
  }});
  return { client, jar };
}
async function request(path, actor, method = 'GET', body) {
  const ctx = clients[actor];
  const response = await fetch(`${origin}${path}`, { method, headers: {
    Cookie: ctx ? [...ctx.jar].map(([n,v]) => `${n}=${v}`).join('; ') : '',
    ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (ctx) for (const cookie of response.headers.getSetCookie()) {
    const first = cookie.split(';')[0], i = first.indexOf('='), cookieName = first.slice(0, i), value = decodeURIComponent(first.slice(i + 1));
    if (value) ctx.jar.set(cookieName, value); else ctx.jar.delete(cookieName);
  }
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const action = (action, expectedVersion, payload = {}) => ({ action, expectedVersion, payload, idempotencyKey: randomUUID() });
const estimatePayload = () => ({ diagnosisNote: 'Brake pads are below safe operating thickness.', items: [
  { kind: 'PART', partId, descriptionSnapshot: 'Brake pad set', quantity: 2, unitPricePkr: 1500 },
  { kind: 'LABOUR', descriptionSnapshot: 'Brake service labour', quantity: 1, unitPricePkr: 2500 },
] });
async function postAction(input, actor = 'advisor-a') {
  return request(`/api/v1/bookings/${booking.id}/actions`, actor, 'POST', input);
}
before(async () => {
  cloud = await connectCloud();
  const versions = await cloud.query('select version from supabase_migrations.schema_migrations');
  if (!versions.some(row => row.version === '20261009180000')) throw new Error('Apply B08 migration before Cloud parts verification.');
  const keys = await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
  if (!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud, actors); fixtures = buildFixtures(actors); await provisionRows(cloud, fixtures);
  for (const actor of ['owner-a','customer-a','customer-b','advisor-a','technician-a','technician-b','parts-a','parts-b']) {
    clients[actor] = context();
    assert.equal((await clients[actor].client.auth.setSession({ access_token: actors[actor].token, refresh_token: actors[actor].refreshToken })).error, null);
  }
  server = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3109'], {
    cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) { ready = true; break; } } catch { /* starting */ }
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Build the frontend before Cloud parts verification.');
  const created = await request('/api/v1/owner/shops', 'owner-a', 'POST', { name, city: 'Lahore', address: 'Marked B08 Cloud fixture', phone: '+920000000000', workingHours: hours, slotCapacity: 3 });
  assert.equal(created.status, 201); shop = created.data.data;
  const createdService = await request(`/api/v1/shops/${shop.id}/services`, 'owner-a', 'POST', { name: 'B08 inspection', durationMinutes: 60 });
  assert.equal(createdService.status, 201); service = createdService.data.data;
  await cloud.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-a'].id)},'SA',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-a'].id)},'TECHNICIAN',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-b'].id)},'TECHNICIAN',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['parts-a'].id)},'PARTS',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['parts-b'].id)},'PARTS',true);`);
  const inventory = await request(`/api/v1/shops/${shop.id}/inventory`, 'parts-a', 'POST', {
    sku:'B08-ZERO',name:'Zero-stock brake pads',quantityOnHand:0,reorderLevel:0,unitCostPkr:900,
  });
  assert.equal(inventory.status,201); partId=inventory.data.data.id;
  const tomorrow = new Date(Date.now() + 5 * 3600000); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const slots = await request(`/api/v1/shops/${shop.id}/slots?date=${tomorrow.toISOString().slice(0,10)}`);
  assert.equal(slots.status, 200); slot = slots.data.data[0]; assert.ok(slot?.id);
  const made = await request('/api/v1/bookings', 'customer-a', 'POST', { shopId: shop.id, slotId: slot.id, serviceIds: [service.id], symptomNotes: '',
    vehicle: { registrationPlate: `B08-${run.slice(0,8)}`, make: 'Honda', model: 'Civic', year: 2016 }, idempotencyKey: randomUUID() });
  assert.equal(made.status, 201); booking = made.data.data;
  assert.equal((await postAction(action('CONFIRM_BOOKING', 0), 'advisor-a')).status, 201);
  assert.equal((await postAction(action('ASSIGN_TECHNICIAN', 1, { technicianUserId: actors['technician-a'].id }), 'advisor-a')).status, 201);
  assert.equal((await postAction(action('START_INSPECTION', 2), 'technician-a')).status, 201);
}, { timeout: 240000 });
after(async () => {
  const errors = [];
  try {
    if (cloud && actors['owner-a']) {
      const owner = sqlLiteral(actors['owner-a'].id), named = sqlLiteral(name);
      const scope = `select id from public.shops where name=${named} and owner_user_id=${owner}`;
      const result = await cloud.query(`begin;
        update public.bookings set status='CANCELLED' where shop_id in (${scope}) and status in ('PENDING','CONFIRMED','ASSIGNED','INSPECTING','ESTIMATE_REVIEW','AWAITING_CUSTOMER','ESTIMATE_APPROVED','ESTIMATE_REJECTED','PARTS_PENDING','PARTS_ORDERED','PARTS_READY');
        update public.shop_memberships set active=false where shop_id in (${scope}) and role<>'OWNER';
        update public.shops set active=false where id in (${scope});
        commit; select (select count(*)::integer from public.shops where id in (${scope}) and active) active_shops;`);
      assert.equal(result[0].active_shops, 0);
    }
  } catch (error) { errors.push(error); }
  try { if (cloud && Object.keys(actors).length) await deactivateFixtures(cloud, actors, fixtures ?? null); }
  catch (error) { errors.push(error); }
  finally { if (server) server.kill(); }
  if (errors.length) throw new AggregateError(errors, 'B08 fixture cleanup failed; inspect exact marked records.');
}, { timeout: 180000 });

async function approveAndAssign() {
  assert.equal((await postAction(action('SUBMIT_ESTIMATE',3,estimatePayload()),'technician-a')).status,201);
  assert.equal((await postAction(action('SEND_ESTIMATE',4,estimatePayload()),'advisor-a')).status,201);
  assert.equal((await postAction(action('APPROVE_ESTIMATE',5),'customer-a')).status,201);
  assert.equal((await postAction(action('ASSIGN_PARTS',6,{partsUserId:actors['parts-a'].id}),'advisor-a')).status,201);
}
async function inventoryStock() {
  return (await cloud.query(`select quantity_on_hand from public.inventory_parts where id=${sqlLiteral(partId)}`))[0].quantity_on_hand;
}
test('B08 Cloud inventory APIs enforce role scope, pagination, duplicate SKUs and immutable existing stock',async()=>{
  const path=`/api/v1/shops/${shop.id}/inventory`;
  for(const actor of ['customer-a','advisor-a','technician-a']) assert.equal((await request(path,actor)).status,403);
  assert.equal((await request(path,'owner-a')).status,200);
  assert.equal((await request(path,'parts-a')).data.data.items.length,1);
  assert.equal((await request(`${path}?page=1&page=2`,'parts-a')).status,400);
  const input={sku:'B08-ZERO',name:'Zero-stock brake pads',quantityOnHand:5,unitCostPkr:900};
  assert.equal((await request(path,'parts-a','POST',input)).status,409);
  assert.equal((await request(path,'parts-a','POST',{...input,id:partId})).status,400);
  const updated=await request(path,'parts-a','POST',{id:partId,sku:'B08-ZERO',name:'Updated brake pads',unitCostPkr:900});
  assert.equal(updated.status,200); assert.equal(updated.data.data.quantityOnHand,0);
  const direct=await cloud.request(`/rest/v1/inventory_parts?id=eq.${partId}`,{method:'PATCH',token:actors['parts-a'].token,body:{quantity_on_hand:100}});
  assert.equal(direct.status,403); assert.equal(await inventoryStock(),0);
});
test('B08 Cloud approved estimate -> parts order -> partial/full receipt -> atomic allocation with safe retries',async()=>{
  await approveAndAssign();
  assert.equal((await postAction(action('MARK_PARTS_READY',7),'parts-b')).status,404);
  assert.equal((await postAction(action('MARK_PARTS_READY',7),'advisor-a')).status,403);
  assert.equal((await postAction(action('MARK_PARTS_READY',7),'parts-a')).status,409);
  const orderInput={expectedVersion:7,idempotencyKey:randomUUID(),supplierName:'B08 supplier',items:[{partId,quantity:2}]};
  const orderPath=`/api/v1/bookings/${booking.id}/purchase-orders`;
  let r=await request(orderPath,'parts-a','POST',orderInput);
  assert.equal(r.status,201); assert.equal(r.data.data.status,'PARTS_ORDERED');
  const po=r.data.data.purchaseOrders[0]; assert.equal(po.status,'ORDERED'); assert.equal(await inventoryStock(),0);
  assert.equal((await request(orderPath,'parts-a','POST',orderInput)).status,200);
  assert.equal((await request(orderPath,'parts-a','POST',{...orderInput,idempotencyKey:randomUUID(),expectedVersion:8,items:[{partId,quantity:1}]})).status,422);
  const receivePath=`/api/v1/purchase-orders/${po.id}/receive`;
  const receipt={expectedVersion:8,idempotencyKey:randomUUID(),items:[{partId,quantity:1}]};
  r=await request(receivePath,'parts-a','POST',receipt);
  assert.equal(r.status,201); assert.equal(r.data.data.status,'PARTS_ORDERED'); assert.equal(r.data.data.stateVersion,8);
  assert.equal(r.data.data.purchaseOrders[0].status,'PARTIALLY_RECEIVED');
  assert.equal((await request(receivePath,'parts-a','POST',receipt)).status,200);
  assert.equal(await inventoryStock(),1);
  assert.equal((await request(receivePath,'parts-a','POST',{...receipt,items:[{partId,quantity:2}]})).status,409);
  assert.equal((await request(receivePath,'parts-a','POST',{...receipt,idempotencyKey:randomUUID(),items:[{partId,quantity:2}]})).status,422);
  r=await request(receivePath,'parts-a','POST',{...receipt,idempotencyKey:randomUUID()});
  assert.equal(r.status,201); assert.equal(r.data.data.status,'PARTS_READY'); assert.equal(r.data.data.stateVersion,9);
  assert.equal(r.data.data.purchaseOrders[0].status,'RECEIVED'); assert.ok(r.data.data.purchaseOrders[0].receivedAt);
  const customer=await request(`/api/v1/bookings/${booking.id}`,'customer-a');
  assert.deepEqual(customer.data.data.requiredParts,[]); assert.deepEqual(customer.data.data.purchaseOrders,[]);
  const tech=await request(`/api/v1/bookings/${booking.id}`,'technician-a');
  assert.equal(tech.data.data.requiredParts[0].quantityRequired,2); assert.equal(tech.data.data.requiredParts[0].unitCostPkr,undefined);
  const allocatePath=`/api/v1/bookings/${booking.id}/allocate-parts`;
  const allocation={expectedVersion:9,idempotencyKey:randomUUID()};
  r=await request(allocatePath,'parts-a','POST',allocation);
  assert.equal(r.status,201); assert.equal(r.data.data.status,'IN_REPAIR'); assert.equal(r.data.data.partAllocations[0].quantity,2);
  assert.equal((await request(allocatePath,'parts-a','POST',allocation)).status,200); assert.equal(await inventoryStock(),0);
  assert.equal((await postAction(action('CANCEL_BOOKING',10,{reason:'Too late to cancel'}),'customer-a')).status,422);
  const audit=(await cloud.query(`select
    (select count(*)::integer from public.part_allocations where booking_id=${sqlLiteral(booking.id)}) allocations,
    (select count(*)::integer from public.booking_history where booking_id=${sqlLiteral(booking.id)} and action='RECEIVE_PARTS') receipts,
    (select count(*)::integer from public.booking_history where booking_id=${sqlLiteral(booking.id)} and action='ALLOCATE_PARTS') allocation_events`))[0];
  assert.deepEqual(audit,{allocations:1,receipts:2,allocation_events:1});
});
test('B08 Cloud labour-only job reaches repair through the stock-ready branch without allocating parts',async()=>{
  const made=await request('/api/v1/bookings','customer-a','POST',{shopId:shop.id,slotId:slot.id,serviceIds:[service.id],symptomNotes:'',
    vehicle:{registrationPlate:`B08-L-${run.slice(0,6)}`,make:'Honda',model:'Civic',year:2016},idempotencyKey:randomUUID()});
  assert.equal(made.status,201); booking=made.data.data;
  assert.equal((await postAction(action('CONFIRM_BOOKING',0))).status,201);
  assert.equal((await postAction(action('ASSIGN_TECHNICIAN',1,{technicianUserId:actors['technician-a'].id}))).status,201);
  assert.equal((await postAction(action('START_INSPECTION',2),'technician-a')).status,201);
  const estimate={diagnosisNote:'Adjustment only; no parts required.',items:[{kind:'LABOUR',descriptionSnapshot:'Adjustment labour',quantity:1,unitPricePkr:1200}]};
  assert.equal((await postAction(action('SUBMIT_ESTIMATE',3,estimate),'technician-a')).status,201);
  assert.equal((await postAction(action('SEND_ESTIMATE',4,estimate))).status,201);
  assert.equal((await postAction(action('APPROVE_ESTIMATE',5),'customer-a')).status,201);
  assert.equal((await postAction(action('ASSIGN_PARTS',6,{partsUserId:actors['parts-a'].id}))).status,201);
  assert.equal((await postAction(action('MARK_PARTS_READY',7),'parts-a')).status,201);
  const r=await request(`/api/v1/bookings/${booking.id}/allocate-parts`,'parts-a','POST',{expectedVersion:8,idempotencyKey:randomUUID()});
  assert.equal(r.status,201); assert.equal(r.data.data.status,'IN_REPAIR'); assert.deepEqual(r.data.data.partAllocations,[]);
});
