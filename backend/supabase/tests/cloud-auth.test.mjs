import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { provisionIdentities, buildFixtures, provisionRows, deactivateFixtures, fixtureId } from './support/cloud-fixtures.mjs';

const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const require = createRequire(`${frontend}/package.json`);
const { createServerClient } = require('@supabase/ssr');
const origin = 'http://localhost:3103';
const actors = {};
const created = [];
let cloud, fixtures, server, publicKey;
const clients = {};

function cookieClient() {
  const jar = new Map();
  const client = createServerClient(`https://${cloud.ref}.supabase.co`, publicKey, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)) },
  });
  return { client, jar };
}
async function request(path, context, { method = 'GET', body, originHeader = origin } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method, headers: { Cookie: context ? [...context.jar].map(([n, v]) => `${n}=${v}`).join('; ') : '',
      ...(method === 'GET' ? {} : { Origin: originHeader, 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (context) for (const entry of response.headers.getSetCookie()) {
    const first = entry.split(';')[0]; const position = first.indexOf('=');
    const name = first.slice(0, position), value = decodeURIComponent(first.slice(position + 1));
    if (value) context.jar.set(name, value); else context.jar.delete(name);
  }
  return { status: response.status, data: await response.json(), headers: response.headers };
}

before(async () => {
  cloud = await connectCloud();
  const versions = await cloud.query('select version from supabase_migrations.schema_migrations');
  if (!versions.some(row => row.version === '20261009100642'))
    throw new Error('B03 Cloud migration is pending approval/application. No Auth fixtures were changed.');
  const keys = await cli(['projects', 'api-keys', '--project-ref', cloud.ref, '--reveal', '--output', 'json']);
  publicKey = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
  const adminKey = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key;
  if (!publicKey || !adminKey) throw new Error('Required Cloud test keys are unavailable.');
  await provisionIdentities(cloud, actors);
  fixtures = buildFixtures(actors); await provisionRows(cloud, fixtures);
  for (const name of ['owner-a', 'owner-b', 'advisor-a', 'outsider']) {
    clients[name] = cookieClient();
    const { error } = await clients[name].client.auth.setSession({ access_token: actors[name].token, refresh_token: actors[name].refreshToken });
    assert.equal(error, null);
  }
  server = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3103'], {
    cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: adminKey, SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  // Bounded readiness probes, not a race-condition workaround.
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) return; } catch { /* starting */ }
    if (server.exitCode !== null) throw new Error('Next.js production server exited before readiness.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Next.js production server was not ready within 30 seconds.');
}, { timeout: 240000 });

after(async () => {
  const errors = [];
  for (const record of created) {
    if (record.signedIn) {
      try {
        const { error } = await record.context.client.auth.signOut({ scope: 'global' });
        if (error) throw new Error('B03 fixture session cleanup failed. Inspect retained fixture accounts.');
      } catch (error) { errors.push(error); }
    }
    try {
      // Match only this run's exact email and Admin marker; keep audit-safe fixtures.
      const rows = await cloud.query(`select id from auth.users where email=${sqlLiteral(record.email)}
        and raw_app_meta_data->>'bayflow_provisioned_by'=${sqlLiteral(actors['owner-a'].id)}
        and raw_app_meta_data->>'bayflow_provisioned_shop'=${sqlLiteral(fixtureId(1, 1))}`);
      for (const row of rows) {
        await cloud.query(`update public.shop_memberships set active=false where user_id=${sqlLiteral(row.id)}
          and shop_id=${sqlLiteral(fixtureId(1, 1))} and role<>'OWNER'; select true as cleaned;`);
        await cloud.requireSuccess(`/auth/v1/admin/users/${row.id}`, { admin: true, method: 'PUT', body: { ban_duration: '876000h' } });
        const sessions = await cloud.query(`select count(*)::integer as sessions from auth.sessions where user_id=${sqlLiteral(row.id)}`);
        assert.equal(sessions[0].sessions, 0, 'B03 fixture sessions must be revoked.');
      }
    } catch (error) { errors.push(error); }
  }
  try { if (cloud && Object.keys(actors).length) await deactivateFixtures(cloud, actors, fixtures ?? null); }
  catch (error) { errors.push(error); }
  finally { if (server) server.kill(); }
  if (errors.length) throw new AggregateError(errors, 'B03 fixture cleanup incomplete; inspect test accounts before using this project.');
}, { timeout: 180000 });

test('B03 anonymous API returns 401 and private no-store', async () => {
  const result = await request('/api/v1/me');
  assert.equal(result.status, 401); assert.equal(result.data.error.code, 'UNAUTHENTICATED');
  assert.match(result.headers.get('cache-control'), /no-store/);
});
test('B03 public RPCs are invokers with no anonymous execution', async () => {
  const rows = await cloud.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('sync_profile','add_staff_membership','edit_staff_membership')`);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.prosecdef, false); assert.equal(row.anon_execute, false);
    assert.equal(row.user_execute, true); assert.ok(row.proconfig.includes('search_path=""'));
  }
  for (const rpc of ['sync_profile', 'add_staff_membership', 'edit_staff_membership']) {
    const result = await cloud.request(`/rest/v1/rpc/${rpc}`, { method: 'POST', body: rpc === 'sync_profile' ? {} :
      { target_shop_id: fixtureId(1, 1), ...(rpc === 'add_staff_membership'
        ? { target_user_id: actors.outsider.id, staff_role: 'SA' }
        : { target_member_id: fixtures.shop_memberships[3].id, is_active: false }) } });
    assert.ok([401, 403].includes(result.status));
  }
});
test('B03 SSR cookie identity and memberships survive repeated requests', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await request('/api/v1/me', clients['owner-a']);
    assert.equal(result.status, 200); assert.equal(result.data.data.user.id, actors['owner-a'].id);
    const shopIds = result.data.data.memberships.map(m => m.shopId);
    assert.ok(shopIds.includes(fixtureId(1, 1)));
    assert.ok(shopIds.includes(fixtureId(1, 3)));
    assert.ok(!JSON.stringify(result.data).includes(actors['owner-a'].token));
  }
});
test('B03 expired cookie session refreshes through the Next.js proxy', async () => {
  const context = clients['owner-a'];
  const prefix = `sb-${cloud.ref}-auth-token`;
  const entries = [...context.jar].filter(([key]) => key === prefix || key.startsWith(`${prefix}.`))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const encoded = entries.map(([, value]) => value).join('');
  assert.ok(encoded.startsWith('base64-'));
  const session = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString());
  session.expires_at = Math.floor(Date.now() / 1000) - 120;
  for (const [key] of entries) context.jar.delete(key);
  const stale = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = stale.match(/.{1,3180}/g);
  chunks.forEach((value, i) => context.jar.set(chunks.length === 1 ? prefix : `${prefix}.${i}`, value));
  const result = await request('/api/v1/me', context);
  assert.equal(result.status, 200); assert.ok(result.headers.getSetCookie().length > 0);
  assert.equal((await request('/api/v1/me', context)).status, 200);
});
test('B03 staff self-provisioning and owner A into shop B are forbidden', async () => {
  for (const [name, shop] of [['advisor-a', 1], ['outsider', 1], ['owner-a', 2]]) {
    const result = await request(`/api/v1/shops/${fixtureId(1, shop)}/team`, clients[name], { method: 'POST', body: {} });
    assert.equal(result.status, 403);
  }
});
for (const role of ['SA', 'TECHNICIAN', 'PARTS', 'QC']) {
  test(`B03 owner provisions ${role}; initial credential signs in to the same shop`, async () => {
    const record = { email: `b03-${randomUUID()}@bayflow.example.test`, password: `${randomBytes(24).toString('base64url')}!aA1` };
    created.push(record);
    const result = await request(`/api/v1/shops/${fixtureId(1, 1)}/team`, clients['owner-a'], { method: 'POST',
      body: { email: record.email, fullName: `B03 ${role}`, role, initialPassword: record.password } });
    assert.equal(result.status, 201); assert.equal(result.data.data.role, role);
    assert.ok(!JSON.stringify(result.data).includes(record.password));
    record.member = result.data.data; record.context = cookieClient();
    assert.equal((await record.context.client.auth.signInWithPassword({ email: record.email, password: record.password })).error, null);
    record.signedIn = true;
    const me = await request('/api/v1/me', record.context);
    assert.equal(me.status, 200); assert.deepEqual(me.data.data.memberships, [record.member]);
  });
}
test('B03 duplicate staff email is rejected without changing the initial credential', async () => {
  const record = created[0]; assert.ok(record.member);
  const result = await request(`/api/v1/shops/${fixtureId(1, 1)}/team`, clients['owner-a'], { method: 'POST',
    body: { email: record.email, fullName: 'Duplicate', role: 'QC', initialPassword: `${randomBytes(24).toString('base64url')}!aA1` } });
  assert.equal(result.status, 409);
  const fresh = cookieClient();
  assert.equal((await fresh.client.auth.signInWithPassword({ email: record.email, password: record.password })).error, null);
  await fresh.client.auth.signOut({ scope: 'local' });
});
test('B03 deactivation immediately removes membership with an existing cookie', async () => {
  const record = created[0];
  const result = await request(`/api/v1/shops/${fixtureId(1, 1)}/team/${record.member.id}`, clients['owner-a'],
    { method: 'PATCH', body: { active: false } });
  assert.equal(result.status, 200); assert.equal(result.data.data.active, false);
  const me = await request('/api/v1/me', record.context);
  assert.equal(me.status, 200); assert.deepEqual(me.data.data.memberships, []);
});
test('B03 logout clears SSR cookies and the next API call returns 401', async () => {
  const context = clients.outsider;
  assert.equal((await context.client.auth.signOut({ scope: 'local' })).error, null);
  assert.equal((await request('/api/v1/me', context)).status, 401);
  const sessions = await cloud.query(`select count(*)::integer as sessions from auth.sessions where user_id=${sqlLiteral(actors.outsider.id)}`);
  assert.equal(sessions[0].sessions, 0, 'Logout must revoke the fixture session.');
  // Cleanup must not issue a second logout using this now-revoked session.
  delete actors.outsider.token;
});
