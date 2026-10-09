import { z } from 'zod';
import { directoryQuery, publicShopOutput, publicServiceOutput, slotOutput, slotsQuery, slugInput } from '@/lib/contracts/shops';

const pagination = { page: z.number().int().positive(), pageSize: z.literal(50), total: z.number().int().nonnegative() };
const shopsPage = z.object({ items: z.array(publicShopOutput), ...pagination });
const servicesPage = z.object({ items: z.array(publicServiceOutput), ...pagination });
export const shopDetailOutput = publicShopOutput.extend({ services: servicesPage });
export type ShopDetail = z.infer<typeof shopDetailOutput>;
export type PublicService = z.infer<typeof publicServiceOutput>;
export type AppointmentSlot = z.infer<typeof slotOutput>;
export type PublicShop = z.infer<typeof publicShopOutput>;
export type DirectoryPage = z.infer<typeof shopsPage>;
export type ServicesPage = z.infer<typeof servicesPage>;
export type DirectoryFilters = { city: string; q: string; page: number };

export class CatalogReadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function read<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    const message = response.status === 403 ? 'This catalog is not available to you.'
      : response.status === 404 ? 'This workshop is no longer available.'
      : response.status === 400 ? 'Check your search and try again.' : 'The catalog could not be loaded. Please try again.';
    throw new CatalogReadError(response.status, message);
  }
  const envelope = z.object({ data: schema, error: z.null() });
  return envelope.parse(await response.json()).data;
}

export function getShops(filters: DirectoryFilters, signal?: AbortSignal) {
  const parsed = directoryQuery.parse({ city: filters.city, q: filters.q, page: String(filters.page) });
  const query = new URLSearchParams({ page: String(parsed.page) });
  if (parsed.city) query.set('city', parsed.city);
  if (parsed.q) query.set('q', parsed.q);
  return read(`/api/v1/shops?${query}`, shopsPage, signal);
}

export function getShopServices(shopId: string, signal?: AbortSignal, page = 1) {
  const id = z.uuid().parse(shopId);
  const parsedPage = directoryQuery.parse({ page: String(page) }).page;
  return read(`/api/v1/shops/${id}/services?page=${parsedPage}`, servicesPage, signal);
}

export function getShopBySlug(slug: string, signal?: AbortSignal) {
  return read(`/api/v1/shops/by-slug/${slugInput.parse(slug)}`, shopDetailOutput, signal);
}

export function getShopSlots(shopId: string, date: string, signal?: AbortSignal) {
  const id = z.uuid().parse(shopId);
  const parsed = slotsQuery.parse({ date });
  return read(`/api/v1/shops/${id}/slots?date=${parsed.date}`, z.array(slotOutput), signal);
}

export function catalogMessage(error: unknown) {
  return error instanceof CatalogReadError ? error.message : 'We could not connect to the catalog. Please try again.';
}
