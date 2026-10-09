import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { workingHours, createShopInput, editShopInput, createServiceInput, editServiceInput,
  slotsQuery, directoryQuery, queryObject } from '@/lib/contracts/shops';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), owner: vi.fn(), save: vi.fn(), service: vi.fn(),
  list: vi.fn(), detail: vi.fn(), slots: vi.fn(), services: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/permissions/owner', () => ({ requireOwner: mocks.owner }));
vi.mock('@/server/services/shops', () => ({ saveShop: mocks.save, saveService: mocks.service,
  listShops: mocks.list, shopDetail: mocks.detail, listSlots: mocks.slots, listServices: mocks.services }));
import { POST as createShop } from '@/app/api/v1/owner/shops/route';
import { PATCH as patchShop } from '@/app/api/v1/owner/shops/[id]/route';
import { GET as directory } from '@/app/api/v1/shops/route';
import { GET as detail } from '@/app/api/v1/shops/[id]/route';
import { GET as bySlug } from '@/app/api/v1/shops/by-slug/[slug]/route';
import { GET as slots } from '@/app/api/v1/shops/[id]/slots/route';
import { POST as createService, GET as services } from '@/app/api/v1/shops/[id]/services/route';
import { PATCH as patchService } from '@/app/api/v1/shops/[id]/services/[serviceId]/route';

const id = 'b0400000-0000-4000-8000-000000000001';
const serviceId = 'b0400000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ id, serviceId }) };
const input = { name: 'Workshop', city: 'Lahore', address: 'Test address', phone: '+924235751001', workingHours: { mon: [['09:00','18:00']] } };
function request(method: string, body?: unknown, query = '', origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000/api/v1/shops${query}`, { method,
    headers: { Origin: origin }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ client: {} }); mocks.owner.mockResolvedValue({ client: {} });
});
it.each([
  { monday: [] }, { mon: [['18:00','09:00']] }, { mon: [['22:00','02:00']] },
  { mon: [['9:00','18:00']] }, { mon: [['09:00','12:00'],['11:00','13:00']] }, { mon: null },
])('rejects unsafe or ambiguous hours %j', value => { expect(workingHours.safeParse(value).success).toBe(false); });
it('validates split shifts, closed days, defaults and allowlisted settings', () => {
  expect(workingHours.parse({ mon: [['09:00','12:00'],['13:00','18:00']], sun: [] }).sun).toEqual([]);
  expect(createShopInput.parse(input)).toMatchObject({ timezone: 'Asia/Karachi', slotCapacity: 1, slotDurationMinutes: 60 });
  for (const value of [{ ...input, ownerUserId: id }, { ...input, slotCapacity: 0 }, { ...input, timezone: 'No/Such_Zone' }])
    expect(createShopInput.safeParse(value).success).toBe(false);
  expect(editShopInput.safeParse({}).success).toBe(false);
  expect(editServiceInput.safeParse({ shopId: id }).success).toBe(false);
  expect(createServiceInput.safeParse({ name: 'Inspection', durationMinutes: 60, basePricePkr: 1.5 }).success).toBe(false);
});
it('validates calendar dates and strict single-valued pagination queries', () => {
  for (const date of ['2026-02-29','2026-13-01','2026-1-01']) expect(slotsQuery.safeParse({ date }).success).toBe(false);
  expect(slotsQuery.parse({ date: '2028-02-29' }).date).toBe('2028-02-29');
  expect(directoryQuery.parse({}).page).toBe(1);
  for (const page of ['0','-1','1.5','1e3','100000']) expect(directoryQuery.safeParse({ page }).success).toBe(false);
  expect(() => queryObject(request('GET', undefined, '?page=1&page=2'))).toThrow();
});
it('catalog reads are public, map parsed queries, and do not require identity', async () => {
  mocks.list.mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 });
  const response = await directory(request('GET', undefined, '?city=Lahore&q=care&page=2'));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({ city: 'Lahore', q: 'care', page: 2 });
  expect(mocks.identity).not.toHaveBeenCalled(); expect(mocks.owner).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('public routes validate IDs, dates, slugs and queries before fetching', async () => {
  expect((await directory(request('GET', undefined, '?unknown=1'))).status).toBe(400);
  expect((await detail(request('GET'), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
  expect((await bySlug(request('GET'), { params: Promise.resolve({ slug: 'Bad/Slug' }) })).status).toBe(400);
  expect((await slots(request('GET', undefined, '?date=2026-02-29'), params)).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.slots).not.toHaveBeenCalled();
});
it('detail, slug, services and slot routes pass only their parsed identifiers', async () => {
  mocks.detail.mockResolvedValue({ id }); mocks.slots.mockResolvedValue([]); mocks.services.mockResolvedValue({ items: [] });
  expect((await detail(request('GET'), params)).status).toBe(200);
  await bySlug(request('GET'), { params: Promise.resolve({ slug: 'workshop' }) });
  expect(mocks.detail).toHaveBeenCalledWith('workshop', true);
  await slots(request('GET', undefined, '?date=2026-10-10'), params);
  expect(mocks.slots).toHaveBeenCalledWith(id, '2026-10-10');
  await services(request('GET', undefined, '?page=2'), params);
  expect(mocks.services).toHaveBeenCalledWith(id, 2);
});
it('missing or unpublished detail yields safe 404 without database details', async () => {
  mocks.detail.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Shop was not found.'));
  expect((await detail(request('GET'), params)).status).toBe(404);
});
it('unauthenticated creation and foreign-owner mutations never reach writes', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in.'));
  expect((await createShop(request('POST', input))).status).toBe(401);
  mocks.owner.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Owner required.'));
  expect((await patchShop(request('PATCH', { name: 'Spoof' }), params)).status).toBe(403);
  expect((await createService(request('POST', { name: 'Spoof', durationMinutes: 60 }), params)).status).toBe(403);
  expect((await patchService(request('PATCH', { active: false }), params)).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
});
it('all catalog mutations reject cross-origin writes', async () => {
  const req = (method: string) => request(method, input, '', 'https://attacker.test');
  for (const response of [await createShop(req('POST')), await patchShop(req('PATCH'), params),
    await createService(req('POST'), params), await patchService(req('PATCH'), params)]) expect(response.status).toBe(403);
  expect(mocks.owner).not.toHaveBeenCalled(); expect(mocks.identity).not.toHaveBeenCalled();
});
it('shop creation returns the committed DTO with server ownership and no client authority fields', async () => {
  mocks.save.mockResolvedValue({ id, ...input, active: true });
  const response = await createShop(request('POST', input));
  expect(response.status).toBe(201);
  expect(mocks.save).toHaveBeenCalledWith({}, null, createShopInput.parse(input));
  expect((await response.json()).data.id).toBe(id);
});
it('service editing/deactivation passes only allowed fields and maps conflicts', async () => {
  mocks.service.mockResolvedValue({ id: serviceId, active: false });
  expect((await patchService(request('PATCH', { active: false }), params)).status).toBe(200);
  expect(mocks.service).toHaveBeenCalledWith({}, id, serviceId, { active: false });
  mocks.save.mockRejectedValue(new ApiError(409, 'SCHEDULE_CONFLICT', 'Existing appointments prevent this change.'));
  expect((await patchShop(request('PATCH', { slotCapacity: 1 }), params)).status).toBe(409);
});
it('invalid mutation payloads never reach RPC services', async () => {
  expect((await createShop(request('POST', { ...input, ownerUserId: id }))).status).toBe(400);
  expect((await patchShop(request('PATCH', {}), params)).status).toBe(400);
  expect((await createService(request('POST', { name: 'Bad', durationMinutes: -1 }), params)).status).toBe(400);
  expect((await patchService(request('PATCH', { shopId: id }), params)).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
});
