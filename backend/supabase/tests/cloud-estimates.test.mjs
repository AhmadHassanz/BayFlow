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
const origin = 'http://localhost:3108', run = randomUUID(), actors = {}, clients = {};
const name = `B07 ${run}`;
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
  if (!versions.some(row => row.version === '20261009161442')) throw new Error('Apply B07 migration before Cloud estimate verification.');
  const keys = await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
  if (!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud, actors); fixtures = buildFixtures(actors); await provisionRows(cloud, fixtures);
  for (const actor of ['owner-a','customer-a','customer-b','advisor-a','technician-a','technician-b']) {
    clients[actor] = context();
    assert.equal((await clients[actor].client.auth.setSession({ access_token: actors[actor].token, refresh_token: actors[actor].refreshToken })).error, null);
  }
  server = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3108'], {
    cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) { ready = true; break; } } catch { /* starting */ }
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Build the frontend before Cloud estimate verification.');
  const created = await request('/api/v1/owner/shops', 'owner-a', 'POST', { name, city: 'Lahore', address: 'Marked B07 Cloud fixture', phone: '+920000000000', workingHours: hours, slotCapacity: 3 });
  assert.equal(created.status, 201); shop = created.data.data;
  const createdService = await request(`/api/v1/shops/${shop.id}/services`, 'owner-a', 'POST', { name: 'B07 inspection', durationMinutes: 60 });
  assert.equal(createdService.status, 201); service = createdService.data.data;
  await cloud.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['advisor-a'].id)},'SA',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-a'].id)},'TECHNICIAN',true),
    (${sqlLiteral(shop.id)},${sqlLiteral(actors['technician-b'].id)},'TECHNICIAN',true);`);
  partId = (await cloud.query(`insert into public.inventory_parts(shop_id,sku,name,quantity_on_hand,reorder_level,unit_cost_pkr,active)
    values(${sqlLiteral(shop.id)},'B07-ZERO','Zero-stock brake pads',0,0,900,true) returning id`))[0].id;
  const tomorrow = new Date(Date.now() + 5 * 3600000); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const slots = await request(`/api/v1/shops/${shop.id}/slots?date=${tomorrow.toISOString().slice(0,10)}`);
  assert.equal(slots.status, 200); slot = slots.data.data[0]; assert.ok(slot?.id);
  const made = await request('/api/v1/bookings', 'customer-a', 'POST', { shopId: shop.id, slotId: slot.id, serviceIds: [service.id], symptomNotes: '',
    vehicle: { registrationPlate: `B07-${run.slice(0,8)}`, make: 'Honda', model: 'Civic', year: 2016 }, idempotencyKey: randomUUID() });
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
        update public.bookings set status='CANCELLED' where shop_id in (${scope}) and status not in ('COMPLETED','CANCELLED');
        update public.shop_memberships set active=false where shop_id in (${scope}) and role<>'OWNER';
        update public.shops set active=false where id in (${scope});
        commit; select (select count(*)::integer from public.shops where id in (${scope}) and active) active_shops;`);
      assert.equal(result[0].active_shops, 0);
    }
  } catch (error) { errors.push(error); }
  try { if (cloud && Object.keys(actors).length) await deactivateFixtures(cloud, actors, fixtures ?? null); }
  catch (error) { errors.push(error); }
  finally { if (server) server.kill(); }
  if (errors.length) throw new AggregateError(errors, 'B07 fixture cleanup failed; inspect exact marked records.');
}, { timeout: 180000 });

test('B07 Cloud estimate flow preserves sent snapshot and enforces customer approval ownership', async () => {
  let response = await postAction(action('SUBMIT_ESTIMATE', 3, estimatePayload()), 'technician-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'ESTIMATE_REVIEW');
  response = await postAction(action('SEND_ESTIMATE', 4, { ...estimatePayload(), items: [
    { kind: 'PART', partId, descriptionSnapshot: 'Brake pad set - OEM', quantity: 2, unitPricePkr: 1700 },
    { kind: 'LABOUR', descriptionSnapshot: 'Brake service labour and bedding', quantity: 1, unitPricePkr: 2600 },
  ] }), 'advisor-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'AWAITING_CUSTOMER');
  const sent = response.data.data.estimates[0];
  assert.equal(sent.state, 'SENT'); assert.equal(sent.subtotalPkr, 6000);
  assert.equal(sent.items.find(item => item.kind === 'PART').lineTotalPkr, 3400);
  response = await postAction(action('APPROVE_ESTIMATE', 5), 'customer-b');
  assert.equal(response.status, 404);
  response = await postAction(action('APPROVE_ESTIMATE', 5), 'technician-a');
  assert.equal(response.status, 403);
  response = await postAction(action('APPROVE_ESTIMATE', 5), 'customer-a');
  assert.equal(response.status, 201); assert.equal(response.data.data.status, 'ESTIMATE_APPROVED');
  assert.equal(response.data.data.estimates[0].state, 'APPROVED');
  assert.equal(response.data.data.estimates[0].items.find(item => item.kind === 'PART').descriptionSnapshot, 'Brake pad set - OEM');
});
