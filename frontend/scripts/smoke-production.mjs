import assert from 'node:assert/strict';

const expectedHost = 'bay-flow-delta.vercel.app';
const configured = process.env.BAYFLOW_PRODUCTION_URL;
assert(configured, 'Set BAYFLOW_PRODUCTION_URL to the approved BayFlow deployment.');
const origin = new URL(configured);
assert.equal(origin.protocol, 'https:', 'Production smoke requires HTTPS.');
assert.equal(origin.hostname, expectedHost, 'Production smoke is restricted to the approved BayFlow deployment.');
assert.equal(origin.pathname, '/', 'Use the deployment origin without a path.');

async function request(path, expectedStatus) {
  const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status}.`);
  return response;
}

const home = await request('/', 200);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
assert.equal(home.headers.get('x-frame-options'), 'DENY');
assert.equal(home.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
assert.equal(home.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
assert.match(await home.text(), /BayFlow/);

const health = await request('/api/v1/health', 200);
assert.deepEqual(await health.json(), { data: { status: 'ok' }, error: null });

const shops = await request('/api/v1/shops?page=1', 200);
assert.match(shops.headers.get('cache-control') ?? '', /no-store/);
const shopEnvelope = await shops.json();
assert.equal(shopEnvelope.error, null);
assert(Array.isArray(shopEnvelope.data?.items));
assert(Number.isInteger(shopEnvelope.data?.total) && shopEnvelope.data.total >= 0, 'The live directory must return a nonnegative total.');
assert(shopEnvelope.data.total >= shopEnvelope.data.items.length, 'The directory total cannot be smaller than the returned page.');

const malformed = await request('/api/v1/shops?page=0', 400);
const malformedEnvelope = await malformed.json();
assert.equal(malformedEnvelope.data, null);
assert.equal(malformedEnvelope.error?.code, 'INVALID_INPUT');
assert.equal(typeof malformedEnvelope.error?.message, 'string');
assert.equal(malformed.headers.get('x-request-id'), malformedEnvelope.error?.details?.requestId);
assert.match(malformedEnvelope.error?.details?.requestId ?? '', /^[0-9a-f-]{36}$/);
assert(!JSON.stringify(malformedEnvelope).toLowerCase().includes('stack'));

const unauthenticated = await request('/api/v1/me', 401);
const unauthenticatedEnvelope = await unauthenticated.json();
assert.equal(unauthenticatedEnvelope.data, null);
assert.equal(unauthenticatedEnvelope.error?.code, 'UNAUTHENTICATED');

console.log(JSON.stringify({ origin: origin.origin, checks: 5, status: 'passed' }));
