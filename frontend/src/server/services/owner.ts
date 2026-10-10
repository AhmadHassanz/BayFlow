import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api/response';
import { shopOutput, serviceOutput } from '@/lib/contracts/shops';
import { bookingStatus } from '@/lib/contracts/bookings';
import { bookingCounts, ownerShopsOutput, ownerShopOutput, ownerServicesOutput, teamListOutput } from '@/lib/contracts/owner';

type Client = Awaited<ReturnType<typeof createClient>>;
const pageSize = 50 as const;
const shopColumns = 'id, slug, name, city, address, phone, working_hours, timezone, slot_duration_minutes, slot_capacity, active, logo_url';
function readError(): never { throw new ApiError(500, 'DATABASE_ERROR', 'Owner records could not be loaded.'); }
function mapShop(row: Record<string, unknown>) {
  return shopOutput.parse({ id: row.id, slug: row.slug, name: row.name, city: row.city, address: row.address, phone: row.phone,
    active: row.active, timezone: row.timezone, workingHours: row.working_hours, slotDurationMinutes: row.slot_duration_minutes,
    slotCapacity: row.slot_capacity, logoUrl: row.logo_url });
}
async function counts(client: Client, shopId: string) {
  const inProgress = bookingStatus.options.filter(status => !['PENDING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'].includes(status));
  const statuses = [['PENDING'], inProgress, ['READY_FOR_PICKUP'], ['COMPLETED']] as const;
  const results = await Promise.all(statuses.map(values => client.from('bookings')
    .select('id', { count: 'exact', head: true }).eq('shop_id', shopId).in('status', [...values])));
  if (results.some(result => result.error || result.count === null)) readError();
  return bookingCounts.parse({ pending: results[0].count, inProgress: results[1].count,
    readyForPickup: results[2].count, completed: results[3].count });
}
export async function listOwnerShops(client: Client, userId: string, page: number) {
  // RLS requires active shop membership; authoritative ownership is an additional filter.
  const result = await client.from('shops').select(shopColumns, { count: 'exact' }).eq('owner_user_id', userId)
    .order('name').order('id').range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error || result.count === null) readError();
  const items = await Promise.all((result.data ?? []).map(async row => ({ shop: mapShop(row), counts: await counts(client, row.id) })));
  return ownerShopsOutput.parse({ items, page, pageSize, total: result.count });
}
export async function getOwnerShop(client: Client, shopId: string) {
  const result = await client.from('shops').select(shopColumns).eq('id', shopId).maybeSingle();
  if (result.error) readError();
  if (!result.data) throw new ApiError(404, 'NOT_FOUND', 'Workshop was not found.');
  return ownerShopOutput.parse({ shop: mapShop(result.data), counts: await counts(client, shopId) });
}
export async function listOwnerServices(client: Client, shopId: string, page: number) {
  const result = await client.from('services').select('id, shop_id, name, description, duration_minutes, base_price_pkr, active', { count: 'exact' })
    .eq('shop_id', shopId).order('name').order('id').range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error || result.count === null) readError();
  return ownerServicesOutput.parse({ items: (result.data ?? []).map(row => serviceOutput.parse({ id: row.id, name: row.name,
    description: row.description, active: row.active, shopId: row.shop_id, durationMinutes: row.duration_minutes,
    basePricePkr: row.base_price_pkr })), page, pageSize, total: result.count });
}
export async function listOwnerTeam(client: Client, shopId: string, page: number) {
  const result = await client.from('shop_memberships').select('id, shop_id, user_id, role, active, profiles(full_name)', { count: 'exact' })
    .eq('shop_id', shopId).order('role').order('id').range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error || result.count === null) readError();
  return teamListOutput.parse({ items: (result.data ?? []).map(row => ({ id: row.id, shopId: row.shop_id,
    userId: row.user_id, role: row.role, active: row.active, fullName: row.profiles?.full_name ?? null })), page, pageSize, total: result.count });
}
