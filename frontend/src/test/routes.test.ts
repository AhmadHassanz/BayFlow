import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { safeNext } from '@/lib/auth/redirect';

const mocks = vi.hoisted(() => ({ identity: vi.fn(), sync: vi.fn(), owner: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity, syncProfile: mocks.sync }));
vi.mock('@/server/permissions/owner', () => ({ requireOwner: mocks.owner }));
vi.mock('@/server/services/team', () => ({ createStaff: mocks.create }));
import { GET } from '@/app/api/v1/me/route';
import { POST } from '@/app/api/v1/shops/[id]/team/route';
import { PATCH } from '@/app/api/v1/shops/[id]/team/[memberId]/route';

const id = 'b0300000-0000-4000-8000-000000000001';
const memberId = 'b0300000-0000-4000-8000-000000000002';
const path = { params: Promise.resolve({ id, memberId }) };
const body = { email: 'staff@example.test', fullName: 'Staff', role: 'SA', initialPassword: 'Test-Password-123!' };
function request(method: string, value: unknown = body, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000/api/v1/shops/${id}/team`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
}
beforeEach(() => vi.resetAllMocks());
it('unauthenticated /me returns a safe 401 and no cacheable session data', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
  const response = await GET();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ data: null, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('/me returns only the verified identity and its active membership DTOs', async () => {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn().mockResolvedValue({
    data: [{ id: memberId, shop_id: id, user_id: memberId, role: 'SA', active: true }], error: null,
  }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  mocks.identity.mockResolvedValue({ client: { from: vi.fn().mockReturnValue(chain) },
    user: { id: memberId, email: 'staff@example.test', user_metadata: { role: 'OWNER' } } });
  mocks.sync.mockResolvedValue({ id: memberId, fullName: 'Staff', phone: null });
  const response = await GET();
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    user: { id: memberId, fullName: 'Staff', phone: null, email: 'staff@example.test' },
    memberships: [{ id: memberId, shopId: id, userId: memberId, role: 'SA', active: true }],
  });
  expect(chain.eq).toHaveBeenCalledWith('user_id', memberId);
  expect(chain.eq).toHaveBeenCalledWith('active', true);
});
it('unauthenticated and nonowner team requests never reach admin provisioning', async () => {
  for (const status of [401, 403]) {
    mocks.owner.mockRejectedValue(new ApiError(status, 'DENIED', 'Denied'));
    expect((await POST(request('POST'), path)).status).toBe(status);
    expect((await PATCH(request('PATCH', { active: false }), path)).status).toBe(status);
  }
  expect(mocks.create).not.toHaveBeenCalled();
});
it('rejects cross-origin team writes before authorization', async () => {
  expect((await POST(request('POST', body, 'https://attacker.test'), path)).status).toBe(403);
  expect(mocks.owner).not.toHaveBeenCalled();
});
it('validates strict mutation schemas and malformed IDs/JSON', async () => {
  mocks.owner.mockResolvedValue({ user: { id } });
  expect((await POST(request('POST', { ...body, role: 'OWNER' }), path)).status).toBe(400);
  expect((await PATCH(request('PATCH', {}), path)).status).toBe(400);
  expect((await POST(request('POST'), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400);
  const malformed = new Request('http://localhost:3000/api/v1/team', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{' });
  expect((await POST(malformed, path)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('returns authoritative membership and never echoes the initial password', async () => {
  mocks.owner.mockResolvedValue({ user: { id } });
  mocks.create.mockResolvedValue({ id: memberId, shopId: id, userId: memberId, role: 'SA', active: true });
  const response = await POST(request('POST'), path);
  expect(response.status).toBe(201);
  expect(await response.text()).not.toContain(body.initialPassword);
});
it('patch maps DB permission and missing-member failures without raw SQL', async () => {
  for (const [code, expected] of [['42501', 403], ['P0002', 404], ['unknown', 500]]) {
    mocks.owner.mockResolvedValue({ client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: 'SECRET_SQL' } }) } });
    const response = await PATCH(request('PATCH', { active: false }), path);
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain('SECRET_SQL');
  }
});
it('patch sends only allowlisted fields and returns committed state', async () => {
  const membership = { id: memberId, shopId: id, userId: memberId, role: 'QC', active: false };
  const rpc = vi.fn().mockResolvedValue({ data: membership, error: null });
  mocks.owner.mockResolvedValue({ client: { rpc } });
  const response = await PATCH(request('PATCH', { role: 'QC', active: false }), path);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('edit_staff_membership', { target_shop_id: id, target_member_id: memberId, staff_role: 'QC', is_active: false });
  expect((await response.json()).data).toEqual(membership);
});
it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/auth/callback', '/\nevil'])
  ('blocks unsafe callback redirects: %s', value => { expect(safeNext(value)).toBe('/api/v1/me'); });
it('preserves a local booking return path without inventing a destination', () => {
  expect(safeNext('/book/abc?step=4')).toBe('/book/abc?step=4');
});
