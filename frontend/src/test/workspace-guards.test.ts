import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { membershipHome, identityHome, canUseWorkspace } from '@/lib/workspace';
import { shopId } from './public-fixtures';

const mocks = vi.hoisted(() => ({ requireIdentity: vi.fn(), syncProfile: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.requireIdentity, syncProfile: mocks.syncProfile }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error('not-found'); } }));
import { workspaceIdentity, shopWorkspace } from '@/server/queries/workspace';
import OwnerPage from '@/app/owner/page';

const userId = 'b1100000-0000-4000-8000-000000000001';
const member = { id: userId, shopId, userId, role: 'SA' as const, active: true };
function setup(rows = [{ id: userId, shop_id: shopId, user_id: userId, role: 'SA', active: true }]) {
  const memberships = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: rows, error: null }) };
  const shops = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [{ id: shopId, name: 'Workshop', city: 'Lahore', timezone: 'Asia/Karachi' }], error: null }) };
  const client = { from: vi.fn((table: string) => table === 'shops' ? shops : memberships) };
  mocks.requireIdentity.mockResolvedValue({ client, user: { id: userId, email: 'user@example.test' } });
  mocks.syncProfile.mockResolvedValue({ id: userId, fullName: 'Member', phone: null });
  mocks.createClient.mockResolvedValue(client);
  return { client, memberships, shops };
}
beforeEach(() => vi.resetAllMocks());
it('redirects unauthenticated deep links to sign-in with the exact destination', async () => {
  mocks.requireIdentity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in'));
  const next = `/customer/bookings/${userId}`;
  await expect(workspaceIdentity(next)).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(next)}`);
});
it('propagates infrastructure errors rather than treating them as logged out', async () => {
  mocks.requireIdentity.mockRejectedValue(new Error('unavailable'));
  await expect(workspaceIdentity('/customer')).rejects.toThrow('unavailable');
});
it('uses verified identity and server-filtered active memberships', async () => {
  const { memberships } = setup();
  expect((await workspaceIdentity('/customer')).user.id).toBe(userId);
  expect(memberships.eq).toHaveBeenCalledWith('user_id', userId);
  expect(memberships.eq).toHaveBeenCalledWith('active', true);
});
it('denies foreign shop URLs before requesting shop labels', async () => {
  const { client } = setup();
  await expect(shopWorkspace(userId, '/foreign')).rejects.toThrow('not-found');
  expect(client.from).not.toHaveBeenCalledWith('shops');
});
it('denies the owner switcher to a service advisor', async () => {
  const { client } = setup();
  await expect(OwnerPage()).rejects.toThrow('not-found');
  expect(client.from).not.toHaveBeenCalledWith('shops');
});
it('denies inactive membership and unauthorized role routes on the server', async () => {
  setup([{ id: userId, shop_id: shopId, user_id: userId, role: 'SA', active: false }]);
  await expect(shopWorkspace(shopId, '/advisor', 'advisor')).rejects.toThrow('not-found');
  setup();
  await expect(shopWorkspace(shopId, '/technician', 'technician')).rejects.toThrow('not-found');
});
it('validates shop IDs before querying and uses the RLS client for shop metadata', async () => {
  const { shops } = setup();
  await expect(shopWorkspace('not-a-uuid', '/bad')).rejects.toThrow('not-found');
  expect(mocks.requireIdentity).not.toHaveBeenCalled();
  const context = await shopWorkspace(shopId, '/advisor', 'advisor');
  expect(context.membership.role).toBe('SA');
  expect(shops.in).toHaveBeenCalledWith('id', [shopId]);
});
it.each(['OWNER', 'SA', 'TECHNICIAN', 'PARTS', 'QC'] as const)('resolves %s home from verified membership', role => {
  const item = { ...member, role };
  const home = membershipHome(item);
  expect(canUseWorkspace(role, home.split('/').at(-1)!)).toBe(true);
  const identity = { user: { id: userId, fullName: 'Member', email: null, phone: null }, memberships: [item] };
  expect(identityHome(identity)).toBe(role === 'OWNER' ? '/owner' : home);
  item.active = false;
  expect(identityHome(identity)).toBe('/customer');
});
