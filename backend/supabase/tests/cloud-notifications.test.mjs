import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures, fixtureId } from './support/cloud-fixtures.mjs';

const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const require = createRequire(`${frontend}/package.json`);
const { createServerClient } = require('@supabase/ssr');
const origin = 'http://localhost:3111', actors = {}, clients = {};
let cloud, fixtures, server, key, ownNotice;

function context() {
  const jar = new Map();
  const client = createServerClient(`https://${cloud.ref}.supabase.co`, key, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
  }});
  return { client, jar };
}

async function request(path, actor, method = 'GET') {
  const ctx = clients[actor];
  const response = await fetch(`${origin}${path}`, { method, headers: {
    Cookie: ctx ? [...ctx.jar].map(([n,v]) => `${n}=${v}`).join('; ') : '',
    ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
  }, body: method === 'GET' ? undefined : '{}', signal: AbortSignal.timeout(30000) });
  if (ctx) for (const cookie of response.headers.getSetCookie()) {
    const first = cookie.split(';')[0], i = first.indexOf('='), name = first.slice(0, i), value = decodeURIComponent(first.slice(i + 1));
    if (value) ctx.jar.set(name, value); else ctx.jar.delete(name);
  }
  return { status: response.status, data: await response.json() };
}

before(async () => {
  cloud = await connectCloud();
  const versions = await cloud.query('select version from supabase_migrations.schema_migrations');
  if (!versions.some(row => row.version === '20261010100000')) throw new Error('Apply B10 migration before Cloud notification verification.');
  const keys = await cli(['projects','api-keys','--project-ref',cloud.ref,'--reveal','--output','json']);
  key = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
  if (!key) throw new Error('Public Cloud test key unavailable.');
  await provisionIdentities(cloud, actors); fixtures = buildFixtures(actors); await provisionRows(cloud, fixtures);
  ownNotice = randomUUID();
  await cloud.query(`insert into public.notifications(id,user_id,shop_id,booking_id,type,title,message,created_at) values ('${ownNotice}','${actors['customer-a'].id}','${fixtureId(1, 1)}','${fixtureId(6, 1)}','B10_CLOUD_TEST','B10 Cloud notice','Notification route fixture',now())`);
  await cloud.query(`update public.notifications set read_at=null where id in ('${fixtureId(17, 1)}','${fixtureId(17, 2)}','${fixtureId(17, 3)}')`);
  for (const actor of ['customer-a','customer-b','advisor-a']) {
    clients[actor] = context();
    assert.equal((await clients[actor].client.auth.setSession({ access_token: actors[actor].token, refresh_token: actors[actor].refreshToken })).error, null);
  }
  server = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3111'], {
    cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) { ready = true; break; } } catch { /* starting */ }
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Build the frontend before Cloud notification verification.');
}, { timeout: 180000 });

after(async () => {
  const errors = [];
  try { if (cloud && Object.keys(actors).length) await deactivateFixtures(cloud, actors, fixtures ?? null); }
  catch (error) { errors.push(error); }
  finally { if (server) server.kill(); }
  if (errors.length) throw new AggregateError(errors, 'B10 fixture cleanup failed; inspect exact marked records.');
}, { timeout: 120000 });

test('B10 Cloud notification list and read marker routes are recipient scoped', async () => {
  const otherNotice = fixtureId(17, 2);
  let response = await request('/api/v1/notifications?unread=true&limit=5', 'customer-a');
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.data.unreadCount >= 1, true);
  assert.ok(response.data.data.items.some(item => item.id === ownNotice));
  assert.equal(response.data.data.items.some(item => item.id === otherNotice), false);

  response = await request(`/api/v1/notifications/${ownNotice}/read`, 'customer-a', 'POST');
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.data.id, ownNotice);
  assert.equal(response.data.data.readAt !== null, true);

  response = await request('/api/v1/notifications?unread=true&limit=5', 'customer-a');
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.data.items.some(item => item.id === ownNotice), false);

  response = await request(`/api/v1/notifications/${otherNotice}/read`, 'customer-a', 'POST');
  assert.equal(response.status, 404, JSON.stringify(response.data));
  response = await request('/api/v1/notifications?limit=51', 'customer-a');
  assert.equal(response.status, 400, JSON.stringify(response.data));
  response = await request('/api/v1/notifications', 'advisor-a');
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.deepEqual(response.data.data.items, []);
});