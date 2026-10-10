import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { ownerListQuery, servicesReadQuery } from '@/lib/contracts/owner';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), owner: vi.fn(), list: vi.fn(), detail: vi.fn(), team: vi.fn(), services: vi.fn(), publicServices: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/permissions/owner', () => ({ requireOwner: mocks.owner }));
vi.mock('@/server/services/owner', () => ({ listOwnerShops: mocks.list, getOwnerShop: mocks.detail, listOwnerTeam: mocks.team, listOwnerServices: mocks.services }));
vi.mock('@/server/services/shops', () => ({ saveShop: vi.fn(), saveService: vi.fn(), listServices: mocks.publicServices }));
import { GET as shops } from '@/app/api/v1/owner/shops/route';
import { GET as settings } from '@/app/api/v1/owner/shops/[id]/route';
import { GET as team } from '@/app/api/v1/shops/[id]/team/route';
import { GET as services } from '@/app/api/v1/shops/[id]/services/route';
const id = 'b1100000-0000-4000-8000-000000001001';
const params = { params: Promise.resolve({ id }) };
const request = (query = '') => new Request(`http://localhost:3000/api/v1/owner/shops${query}`);
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ client: {}, user: { id } }); mocks.owner.mockResolvedValue({ client: {} });
  mocks.list.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
});
it('lists owned shops using the verified actor and bounded query, with private no-store headers', async () => {
  const response = await shops(request('?page=2'));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({}, id, 2);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
});
it.each([401, 403])('owner reads handle authorization HTTP %i without calling services', async status => {
  mocks.owner.mockRejectedValue(new ApiError(status, 'FORBIDDEN', 'Unavailable'));
  for (const read of [settings, team]) expect((await read(request(), params)).status).toBe(status);
  expect((await services(request('?scope=owner'), params)).status).toBe(status);
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.team).not.toHaveBeenCalled(); expect(mocks.services).not.toHaveBeenCalled();
});
it('requires a session for the owner index', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in'));
  expect((await shops(request())).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it('keeps public service reads separate from owner-only inactive service reads', async () => {
  mocks.publicServices.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
  mocks.services.mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 });
  expect((await services(request(), params)).status).toBe(200);
  expect(mocks.owner).not.toHaveBeenCalled();
  expect((await services(request('?scope=owner&page=2'), params)).status).toBe(200);
  expect(mocks.owner).toHaveBeenCalledWith(id);
  expect(mocks.services).toHaveBeenCalledWith({}, id, 2);
});
it('rejects malformed identifiers, duplicate parameters and unknown query fields', async () => {
  expect((await settings(request(), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
  for (const query of ['?page=1&page=2', '?page=0', '?userId=forged', '?page=100000']) expect((await shops(request(query))).status).toBe(400);
  expect((await services(request('?scope=all'), params)).status).toBe(400);
  expect(mocks.detail).not.toHaveBeenCalled();
});
it('strict read schemas never accept actor IDs or open-ended private scopes', () => {
  expect(ownerListQuery.safeParse({ ownerId: id }).success).toBe(false);
  expect(servicesReadQuery.safeParse({ scope: 'owner', page: '1' }).success).toBe(true);
  expect(servicesReadQuery.safeParse({ scope: 'all' }).success).toBe(false);
});
it('does not expose raw database exceptions', async () => {
  mocks.detail.mockRejectedValue(new Error('PRIVATE_SQL_DETAIL'));
  const response = await settings(request(), params);
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('PRIVATE_SQL_DETAIL');
});
