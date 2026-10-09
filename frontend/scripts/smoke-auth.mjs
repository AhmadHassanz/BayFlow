import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No credentials or Cloud writes. Authenticated flows use backend's Cloud suite.
const frontend = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://localhost:3104';
const child = spawn(process.execPath, [`${frontend}/node_modules/next/dist/bin/next`, 'start', '-p', '3104'], {
  cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_smoke_only',
    NEXT_PUBLIC_SITE_URL: origin, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
});
async function request(path, method = 'GET', requestOrigin = origin) {
  return fetch(`${origin}${path}`, { method, signal: AbortSignal.timeout(5000),
    ...(method === 'GET' ? {} : { headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: '{}' }) });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/api/v1/me')).status === 401) { ready = true; break; } } catch { /* starting */ }
    if (child.exitCode !== null) throw new Error('Production server exited; build the frontend first.');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Production server did not become ready.');
  const shop = 'b0300000-0000-4000-8000-000000000001';
  for (const [path, method, expected, requestOrigin] of [
    ['/api/v1/me', 'GET', 401, origin],
    [`/api/v1/shops/${shop}/team`, 'POST', 401, origin],
    [`/api/v1/shops/${shop}/team/${shop}`, 'PATCH', 401, origin],
    [`/api/v1/shops/${shop}/team`, 'POST', 403, 'https://attacker.test'],
    ['/auth/callback', 'GET', 400, origin],
  ]) {
    const response = await request(path, method, requestOrigin);
    assert.equal(response.status, expected, `${method} ${path}`);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.json()).data, null);
    console.log(`${method} ${path}: ${expected}, no-store, safe error envelope`);
  }
  console.log('B03 production HTTP smoke: 5/5 passed (no credentials or Cloud writes).');
} finally { child.kill(); }
