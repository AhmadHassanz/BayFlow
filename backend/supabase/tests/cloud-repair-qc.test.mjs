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
const origin = 'http://localhost:3110', run = randomUUID(), actors = {}, clients = {};
const name = `B09 ${run}`;
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
  return { status: response.status, data: await response.json() };
}
const action = (action, expectedVersion, payload = {}) => ({ action, expectedVersion, payload, idempotencyKey: randomUUID() });
async function postAction(input, actor = 'advisor-a') {
  return request(`/api/v1/bookings/${booking.id}/actions`, actor, 'POST', input);
}
async function createBookingInRepair({ plate, labourOnly = false } = {}) {
  const made = await request('/api/v1/bookings', 'customer-a', 'POST', { shopId: shop.id, slotId: slot.id, serviceIds: [service.id], symptomNotes: '',
    vehicle: { registrationPlate: plate, make: 'Honda', model: 'Civic', year: 2016 }, idempotencyKey: randomUUID() });
  assert.equal(made.status, 201); booking = made.data.data;
  assert.equal((await postAction(action('CONFIRM_BOOKING',0))).status,201);
  assert.equal((await postAction(action('ASSIGN_TECHNICIAN',1,{technicianUserId:actors['technician-a'].id}))).status,201);
  assert.equal((await postAction(action('START_INSPECTION',2),'technician-a')).status,201);
  const estimate = { diagnosisNote: 'B09 repair verification estimate.', items: [
    ...(labourOnly ? [] : [{ kind: 'PART', partId, descriptionSnapshot: 'B09 brake pads', quantity: 1, unitPricePkr: 1500 }]),
    { kind: 'LABOUR', descriptionSnapshot: 'Repair labour', quantity: 1, unitPricePkr: 2500 },
  ] };
  assert.equal((await postAction(action('SUBMIT_ESTIMATE',3,estimate),'technician-a')).status,201);
  assert.equal((await postAction(action('SEND_ESTIMATE',4,estimate))).status,201);
  assert.equal((await postAction(action('APPROVE_ESTIMATE',5),'customer-a')).status,201);
  assert.equal((await postAction(action('ASSIGN_PARTS',6,{partsUserId:actors['parts-a'].id}))).status,201);
  assert.equal((await postAction(action('MARK_PARTS_READY',7),'parts-a')).status,201);
  const allocated = await request(`/api/v1/bookings/${booking.id}/allocate-parts`, 'parts-a', 'POST', { expectedVersion: 8, idempotencyKey: randomUUID() });
  assert.equal(allocated.status, 201); assert.equal(allocated.data.data.status, 'IN_REPAIR');
}

before(async () => {
  cloud = await connectCloud();
  const versions = await cloud.query('select version from supabase_migrations.schema_migrations');
  if (!versions.some(row => row.version === '20261009190000')) throw new Error('Apply B09 migration before Cloud repair/QC verification.');
  const keys = await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
  if (!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud, actors); fixtures = buildFixtures(actors); await provisionRows(cloud, fixtures);
  for (const actor of ['owner-a','customer-a','advisor-a','technician-a','parts-a','qc-a','qc-other-a']) {
    clients[actor] = context();
    assert.equal((await clients[actor].client.auth.setSession({ access_token: actors[actor].token, refresh_token: actors[actor].refreshToken })).error, null);
  }
  server = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3110'], {
    cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) { ready = true; break; } } catch { /* starting */ }
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Build the frontend before Cloud repair/QC verification.');
  const created = await request('/api/v1/owner/shops', 'owner-a', 'POST', { name, city: 'Lahore', address: 'Marked B09 Cloud fixture', phone: '+920000000000', workingHours: hours, slotCapacity: 3 });
  assert.equal(created.status, 201); shop = created.data.data;
  const createdService = await request(`/api/v1/shops/${shop.id}/services`, 'owner-a', 'POST', { name: 'B09 inspection', durationMinutes: 60 });
  assert.equal(createdService.status, 201); service = createdService.data.data;
  await cloud.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-a'].id)},'SA',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-a'].id)},'TECHNICIAN',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['parts-a'].id)},'PARTS',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['qc-a'].id)},'QC',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['qc-other-a'].id)},'QC',true);`);
  const inventory = await request(`/api/v1/shops/${shop.id}/inventory`, 'parts-a', 'POST', { sku:'B09-PAD', name:'B09 brake pads', quantityOnHand:3, reorderLevel:0, unitCostPkr:900 });
  assert.equal(inventory.status, 201); partId = inventory.data.data.id;
  const tomorrow = new Date(Date.now() + 5 * 3600000); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const slots = await request(`/api/v1/shops/${shop.id}/slots?date=${tomorrow.toISOString().slice(0,10)}`);
  assert.equal(slots.status, 200); slot = slots.data.data[0]; assert.ok(slot?.id);
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
  if (errors.length) throw new AggregateError(errors, 'B09 fixture cleanup failed; inspect exact marked records.');
}, { timeout: 180000 });

test('B09 Cloud repair, QC fail/fix/pass, ready notification and pickup complete through route handlers', async () => {
  await createBookingInRepair({ plate: `B09-${run.slice(0,8)}` });
  let response = await postAction(action('COMPLETE_REPAIR', 9, { notes: 'Repair completed and road tested.' }), 'technician-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'QC_PENDING');
  const queue = await request(`/api/v1/shops/${shop.id}/qc-queue?page=1`, 'qc-a');
  assert.equal(queue.status, 200, JSON.stringify(queue.data)); assert.ok(queue.data.data.items.some(item => item.id === booking.id));
  assert.equal((await postAction(action('CLAIM_QC', 10), 'qc-a')).status, 201);
  assert.equal((await postAction(action('PASS_QC', 11, { checklist: { roadTest: true } }), 'qc-other-a')).status, 404);
  response = await postAction(action('FAIL_QC', 11, {
    checklist: { roadTest: false }, notes: 'Noise remained on test drive.', title: 'Brake noise remains', description: 'Noise remained during low speed braking.',
  }), 'qc-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'IN_REPAIR');
  response = await postAction(action('COMPLETE_REPAIR', 12, { notes: 'Adjusted pads and repeated road test.' }), 'technician-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'QC_PENDING');
  assert.equal(response.data.data.qcIssues[0].resolvedAt !== null, true);
  assert.equal((await postAction(action('CLAIM_QC', 13), 'qc-other-a')).status, 201);
  response = await postAction(action('PASS_QC', 14, { checklist: { roadTest: true }, notes: 'Passed after adjustment.' }), 'qc-other-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'READY_FOR_PICKUP');
  const notify = action('NOTIFY_READY', 15);
  assert.equal((await postAction(notify, 'advisor-a')).status, 201);
  assert.equal((await postAction(notify, 'advisor-a')).status, 200);
  response = await postAction(action('COMPLETE_PICKUP', 15), 'customer-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'COMPLETED'); assert.ok(response.data.data.completedAt);
  assert.equal((await postAction(action('COMPLETE_PICKUP', 16), 'advisor-a')).status, 422);
  const audit = (await cloud.query(`select
    (select count(*)::integer from public.qc_runs where booking_id=${sqlLiteral(booking.id)}) qc_runs,
    (select count(*)::integer from public.qc_issues where booking_id=${sqlLiteral(booking.id)}) qc_issues,
    (select count(*)::integer from public.notifications where booking_id=${sqlLiteral(booking.id)} and type='READY_FOR_PICKUP') ready_notices`))[0];
  assert.deepEqual(audit, { qc_runs: 2, qc_issues: 1, ready_notices: 1 });
});
