import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ publicClient: vi.fn() }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: mocks.publicClient }));
import { catalogError, listShops, listSlots, shopDetail, saveShop, saveService } from '@/server/services/shops';
import type { createClient } from '@/lib/supabase/server';
const id = 'b0400000-0000-4000-8000-000000000001';
const shop = { id, slug: 'workshop', name: 'Workshop', city: 'Lahore', address: 'Test address', phone: '+924235751001',
  working_hours: {}, timezone: 'Asia/Karachi', slot_duration_minutes: 60, slot_capacity: 2, logo_url: null,
  owner_user_id: 'PRIVATE', active: true };
function chain(result: unknown) {
  const methods = { select: vi.fn(), ilike: vi.fn(), order: vi.fn(), range: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result), limit: vi.fn().mockResolvedValue(result) };
  for (const key of ['select','ilike','order','eq'] as const) methods[key].mockReturnValue(methods);
  methods.range.mockResolvedValue(result);
  return methods;
}
beforeEach(() => vi.resetAllMocks());
it('directory literal search escapes wildcards, bounds pagination and strips private fields', async () => {
  const query = chain({ data: [shop], error: null, count: 1 });
  mocks.publicClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
  const result = await listShops({ q: '100%_care', city: 'Lahore', page: 2 });
  expect(query.ilike).toHaveBeenCalledWith('name', '%100\\%\\_care%');
  expect(query.range).toHaveBeenCalledWith(50,99);
  expect(result.items[0]).not.toHaveProperty('owner_user_id'); expect(result.items[0]).not.toHaveProperty('active');
});
it('unpublished/missing shops return 404 before reading services', async () => {
  const from = vi.fn().mockReturnValue(chain({ data: null, error: null }));
  mocks.publicClient.mockReturnValue({ from });
  await expect(shopDetail(id)).rejects.toMatchObject({ status: 404 });
  expect(from).toHaveBeenCalledTimes(1);
});
it('slot queries use shop local date and return aggregate-only camelCase DTOs', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T21:00:00Z')); // Karachi is already Oct 10.
  try {
    const query = chain({ data: [{ id, shop_id: id, starts_at: '2026-10-10T04:00:00Z', ends_at: '2026-10-10T05:00:00Z',
      capacity: 2, capacity_remaining: 1, customer_id: 'PRIVATE' }], error: null });
    mocks.publicClient.mockReturnValueOnce({ from: vi.fn().mockReturnValue(chain({ data: shop, error: null })) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(query) });
    const result = await listSlots(id,'2026-10-10');
    expect(query.eq).toHaveBeenCalledWith('local_date','2026-10-10');
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(result[0].capacityRemaining).toBe(1); expect(result[0]).not.toHaveProperty('customer_id');
    mocks.publicClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain({ data: shop, error: null })) });
    await expect(listSlots(id,'2026-10-09')).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
    await expect(listSlots(id,'2026-10-24')).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
  } finally { vi.useRealTimers(); }
});
it.each([['42501',403],['P0002',404],['22023',400],['23514',409],['unknown',500]])
  ('catalog database error %s becomes a safe %i', (code,status) => {
    expect(() => catalogError({ code })).toThrow(expect.objectContaining({ status }));
  });
it('RPC services preserve authoritative responses and never pass owner IDs', async () => {
  const output = { id, slug: shop.slug, name: shop.name, city: shop.city, address: shop.address, phone: shop.phone,
    workingHours: {}, timezone: shop.timezone, slotDurationMinutes: 60, slotCapacity: 2, logoUrl: null, active: true };
  const rpc = vi.fn().mockResolvedValue({ data: output, error: null });
  const client = { rpc } as unknown as Awaited<ReturnType<typeof createClient>>;
  expect(await saveShop(client,null,{ name: 'Workshop' })).toEqual(output);
  expect(rpc).toHaveBeenCalledWith('save_shop',{ target_shop_id: null, settings: { name: 'Workshop' } });
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SECRET_SQL' } });
  await expect(saveService(client,id,null,{ name: 'Spoof' })).rejects.toMatchObject({ status: 403 });
});
