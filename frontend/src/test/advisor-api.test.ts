import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { listTechnicians } from '@/server/services/advisor';
import type { createClient } from '@/lib/supabase/server';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), owner: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/permissions/owner', () => ({ requireOwner: mocks.owner }));
import { GET } from '@/app/api/v1/shops/[id]/team/route';
import { requireAdvisor } from '@/server/permissions/advisor';
const shopId = 'b1100000-0000-4000-8000-000000001001';
const userId = 'b1100000-0000-4000-8000-000000000003';
type Client = Awaited<ReturnType<typeof createClient>>;
const request = (query = '?scope=technicians') => new Request(`http://localhost:3000/api/v1/shops/${shopId}/team${query}`);
const params = { params: Promise.resolve({ id: shopId }) };
function chain(result: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result) };
}
beforeEach(() => vi.resetAllMocks());
it('requires an active verified same-shop OWNER/SA membership before loading technicians', async () => {
  const guard = chain({ data: null, error: null });
  const from = vi.fn().mockReturnValue(guard);
  mocks.identity.mockResolvedValue({ user: { id: userId }, client: { from } });
  expect((await GET(request(), params)).status).toBe(403);
  expect(guard.eq).toHaveBeenCalledWith('shop_id', shopId);
  expect(guard.eq).toHaveBeenCalledWith('user_id', userId);
  expect(guard.eq).toHaveBeenCalledWith('active', true);
  expect(guard.in).toHaveBeenCalledWith('role', ['OWNER', 'SA']);
  expect(from).toHaveBeenCalledTimes(1);
});
it('returns safe paginated choices without passwords, Auth email, inactive or foreign-shop queries', async () => {
  const guard = chain({ data: { id: userId }, error: null });
  const choices = chain({ data: [{ user_id: userId, profiles: { full_name: 'Mechanic' }, email: 'TEST_PRIVATE' }], error: null, count: 51 });
  const from = vi.fn().mockReturnValueOnce(guard).mockReturnValue(choices);
  mocks.identity.mockResolvedValue({ user: { id: userId }, client: { from } });
  const response = await GET(request('?scope=technicians&page=2'), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { items: [{ userId, fullName: 'Mechanic' }], page: 2, pageSize: 50, total: 51 }, error: null });
  expect(choices.eq).toHaveBeenCalledWith('shop_id', shopId);
  expect(choices.eq).toHaveBeenCalledWith('active', true);
  expect(choices.eq).toHaveBeenCalledWith('role', 'TECHNICIAN');
  expect(choices.range).toHaveBeenCalledWith(50, 99);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect(mocks.owner).not.toHaveBeenCalled();
});
it('retains the owner-only full roster and rejects unsupported or duplicate scopes', async () => {
  mocks.owner.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Owner only'));
  expect((await GET(request(''), params)).status).toBe(403);
  for (const query of ['?scope=all', '?scope=technicians&scope=technicians', '?scope=technicians&userId=forged', '?scope=technicians&page=0'])
    expect((await GET(request(query), params)).status).toBe(400);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it('handles expired Auth and membership query failures safely', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in'));
  expect((await GET(request(), params)).status).toBe(401);
  mocks.identity.mockResolvedValue({ user: { id: userId }, client: { from: () => chain({ data: null, error: { message: 'PRIVATE' } }) } });
  await expect(requireAdvisor(shopId)).rejects.toMatchObject({ status: 500 });
});
it('never invents an empty roster on query/count failure', async () => {
  const client = { from: () => chain({ data: [], error: null, count: null }) } as unknown as Client;
  await expect(listTechnicians(client, shopId, 1)).rejects.toMatchObject({ status: 500 });
});
it('F10 parts choices retain active same-shop OWNER/SA guards and expose only PARTS IDs/names', async () => {
  const guard = chain({ data: { id: userId }, error: null });
  const choices = chain({ data: [{ user_id: userId, profiles: { full_name: 'Parts member' }, secret: 'PRIVATE' }], error: null, count: 1 });
  mocks.identity.mockResolvedValue({ user: { id: userId }, client: { from: vi.fn().mockReturnValueOnce(guard).mockReturnValue(choices) } });
  const response = await GET(request('?scope=parts'), params);
  expect(response.status).toBe(200); expect(choices.eq).toHaveBeenCalledWith('role', 'PARTS');
  expect(choices.eq).toHaveBeenCalledWith('shop_id', shopId); expect(choices.eq).toHaveBeenCalledWith('active', true);
  expect((await response.json()).data.items).toEqual([{ userId, fullName: 'Parts member' }]);
  mocks.identity.mockResolvedValue({ user: { id: userId }, client: { from: () => chain({ data: null, error: null }) } });
  expect((await GET(request('?scope=parts'), params)).status).toBe(403);
});
