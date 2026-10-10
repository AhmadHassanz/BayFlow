import { expect, it, vi } from 'vitest';
import { listOwnerShops, getOwnerShop, listOwnerTeam, listOwnerServices } from '@/server/services/owner';
import type { createClient } from '@/lib/supabase/server';
const id = 'b1100000-0000-4000-8000-000000001001';
const otherId = 'b1100000-0000-4000-8000-000000001002';
const raw = { id, slug: 'workshop', name: 'Workshop', city: 'Lahore', address: 'Road', phone: '+924235751001', working_hours: {}, timezone: 'Asia/Karachi', slot_duration_minutes: 60, slot_capacity: 1, logo_url: null, active: false, owner_user_id: otherId };
type Client = Awaited<ReturnType<typeof createClient>>;
function chain(result: unknown) {
  const value = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result) };
  return value;
}
function setup(rows = [raw]) {
  const shops = chain({ data: rows, error: null, count: rows.length });
  shops.maybeSingle.mockResolvedValue({ data: rows[0] ?? null, error: null });
  const countQueries: ReturnType<typeof chain>[] = [];
  const client = { from: vi.fn((table: string) => {
    if (table === 'shops') return shops;
    const query = chain({ data: null, error: null });
    const value = countQueries.length + 1;
    query.in.mockResolvedValue({ count: value, error: null }); countQueries.push(query);
    return query;
  }) };
  return { client: client as unknown as Client, from: client.from, shops, countQueries };
}
it('filters by verified ownership, paginates deterministically and counts scoped bookings without truncating rows', async () => {
  const { client, shops, countQueries } = setup();
  const result = await listOwnerShops(client, otherId, 2);
  expect(shops.eq).toHaveBeenCalledWith('owner_user_id', otherId);
  expect(shops.range).toHaveBeenCalledWith(50, 99);
  expect(result.items[0].shop.active).toBe(false);
  expect(result.items[0].shop).not.toHaveProperty('owner_user_id');
  expect(result.items[0].counts).toEqual({ pending: 1, inProgress: 2, readyForPickup: 3, completed: 4 });
  for (const query of countQueries) {
    expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('shop_id', id);
  }
  expect(countQueries[1].in).toHaveBeenCalledWith('status', expect.not.arrayContaining(['PENDING', 'COMPLETED', 'CANCELLED', 'READY_FOR_PICKUP']));
});
it('keeps per-shop summaries isolated rather than sharing totals', async () => {
  const { client, countQueries } = setup([raw, { ...raw, id: otherId }]);
  await listOwnerShops(client, otherId, 1);
  expect(countQueries).toHaveLength(8);
  for (const query of countQueries.slice(0, 4)) expect(query.eq).toHaveBeenCalledWith('shop_id', id);
  for (const query of countQueries.slice(4)) expect(query.eq).toHaveBeenCalledWith('shop_id', otherId);
});
it('missing shops do not produce fake zero metrics', async () => {
  const { client, from } = setup([]);
  await expect(getOwnerShop(client, id)).rejects.toMatchObject({ status: 404 });
  expect(from).toHaveBeenCalledTimes(1);
});
it('a failed exact count aborts the summary rather than displaying zero', async () => {
  const { client, from } = setup();
  const broken = chain({}); broken.in.mockResolvedValue({ count: null, error: { message: 'PRIVATE' } });
  from.mockImplementation(table => table === 'bookings' ? broken : setup().shops);
  await expect(getOwnerShop(client, id)).rejects.toMatchObject({ status: 500, code: 'DATABASE_ERROR' });
});
it('private team lists include inactive memberships and minimal profile names, never auth credentials', async () => {
  const query = chain({ data: [{ id, shop_id: id, user_id: otherId, role: 'TECHNICIAN', active: false, profiles: { full_name: 'Mechanic' }, password: 'TEST_ONLY_PRIVATE' }], error: null, count: 1 });
  const result = await listOwnerTeam({ from: vi.fn().mockReturnValue(query) } as unknown as Client, id, 1);
  expect(query.eq).toHaveBeenCalledWith('shop_id', id);
  expect(query.eq).not.toHaveBeenCalledWith('active', true);
  expect(result.items[0]).toMatchObject({ fullName: 'Mechanic', role: 'TECHNICIAN', active: false });
  expect(JSON.stringify(result)).not.toContain('TEST_ONLY_PRIVATE');
});
it('private service reads retain inactive status and nullable guide prices', async () => {
  const query = chain({ data: [{ id, shop_id: id, name: 'Inspection', description: '', duration_minutes: 60, base_price_pkr: null, active: false }], error: null, count: 1 });
  const result = await listOwnerServices({ from: vi.fn().mockReturnValue(query) } as unknown as Client, id, 1);
  expect(query.eq).toHaveBeenCalledWith('shop_id', id);
  expect(result.items[0]).toMatchObject({ shopId: id, active: false, basePricePkr: null });
});
