import 'server-only';
import { ApiError } from '@/lib/api/response';
import { createPublicClient } from '@/lib/supabase/public';
import type { createClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/database.types';
import { publicShopOutput, publicServiceOutput, shopOutput, serviceOutput, slotOutput } from '@/lib/contracts/shops';

type Client = Awaited<ReturnType<typeof createClient>>;
type ShopRow = Database['public']['Views']['public_shops']['Row'];
type ServiceRow = Database['public']['Views']['public_services']['Row'];
const pageSize = 50;
function mapShop(row: ShopRow) {
  return publicShopOutput.parse({ id: row.id, slug: row.slug, name: row.name, city: row.city, address: row.address,
    phone: row.phone, workingHours: row.working_hours, timezone: row.timezone,
    slotDurationMinutes: row.slot_duration_minutes, slotCapacity: row.slot_capacity, logoUrl: row.logo_url });
}
function mapService(row: ServiceRow) {
  return publicServiceOutput.parse({ id: row.id, shopId: row.shop_id, name: row.name, description: row.description,
    durationMinutes: row.duration_minutes, basePricePkr: row.base_price_pkr });
}
function readError() { throw new ApiError(500, 'DATABASE_ERROR', 'The catalog could not be loaded.'); }
function notFound(): never { throw new ApiError(404, 'NOT_FOUND', 'Shop was not found.'); }
// Escape LIKE wildcards; q is a literal name substring, never an OR expression.
const literalLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
export async function listShops(input: { city?: string; q?: string; page: number }) {
  let query = createPublicClient().from('public_shops').select('*', { count: 'exact' });
  if (input.city) query = query.ilike('city', literalLike(input.city));
  if (input.q) query = query.ilike('name', `%${literalLike(input.q)}%`);
  const result = await query.order('name').order('id').range((input.page - 1) * pageSize, input.page * pageSize - 1);
  if (result.error) readError();
  return { items: (result.data ?? []).map(mapShop), page: input.page, pageSize, total: result.count ?? 0 };
}
async function publishedShop(identifier: string, bySlug = false) {
  const result = await createPublicClient().from('public_shops').select('*').eq(bySlug ? 'slug' : 'id', identifier).maybeSingle();
  if (result.error) readError();
  if (!result.data) notFound();
  return mapShop(result.data);
}
export async function listServices(shopId: string, page: number) {
  await publishedShop(shopId);
  const result = await createPublicClient().from('public_services').select('*', { count: 'exact' }).eq('shop_id', shopId)
    .order('name').order('id').range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) readError();
  return { items: (result.data ?? []).map(mapService), page, pageSize, total: result.count ?? 0 };
}
export async function shopDetail(identifier: string, bySlug = false) {
  const shop = await publishedShop(identifier, bySlug);
  const services = await listServices(shop.id, 1);
  return { ...shop, services };
}
export async function listSlots(shopId: string, date: string) {
  const shop = await publishedShop(shopId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: shop.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const last = new Date(`${today}T00:00:00Z`); last.setUTCDate(last.getUTCDate() + 13);
  if (date < today || date > last.toISOString().slice(0, 10))
    throw new ApiError(400, 'DATE_OUT_OF_RANGE', 'Choose a date within the next 14 local calendar days.');
  const result = await createPublicClient().from('public_appointment_slots').select('id,shop_id,starts_at,ends_at,capacity,capacity_remaining')
    .eq('shop_id', shopId).eq('local_date', date).order('starts_at').limit(100);
  if (result.error) readError();
  return (result.data ?? []).map(row => slotOutput.parse({ id: row.id, shopId: row.shop_id, startsAt: row.starts_at,
    endsAt: row.ends_at, capacity: row.capacity, capacityRemaining: row.capacity_remaining }));
}
export function catalogError(error: { code?: string }): never {
  if (error.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'Only an authorized owner can manage this catalog.');
  if (error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Service was not found.');
  if (error.code === '22023') throw new ApiError(400, 'INVALID_INPUT', 'Check the catalog settings.');
  if (error.code === '23514') throw new ApiError(409, 'SCHEDULE_CONFLICT', 'Existing appointments prevent this schedule or capacity change.');
  throw new ApiError(500, 'DATABASE_ERROR', 'The catalog operation could not be completed.');
}
export async function saveShop(client: Client, shopId: string | null, settings: Json) {
  const result = await client.rpc('save_shop', { target_shop_id: shopId, settings });
  if (result.error) catalogError(result.error);
  return shopOutput.parse(result.data);
}
export async function saveService(client: Client, shopId: string, serviceId: string | null, settings: Json) {
  const result = await client.rpc('save_service', { target_shop_id: shopId, target_service_id: serviceId, settings });
  if (result.error) catalogError(result.error);
  return serviceOutput.parse(result.data);
}
