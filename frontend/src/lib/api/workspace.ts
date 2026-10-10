import { z } from 'zod';
import { BookingReadError } from './booking';
import { myBookingListOutput, qcQueueOutput, shopBookingListOutput } from '@/lib/contracts/booking-actions';
import { bookingStatus } from '@/lib/contracts/bookings';
import { inventoryListOutput } from '@/lib/contracts/parts';
import { estimateCatalogOutput } from '@/lib/contracts/technician';
import { notificationListOutput } from '@/lib/contracts/notifications';

const uuid = z.uuid().transform(value => value.toLowerCase());
const pageNumber = z.number().int().min(1).max(99999);
const assignee = z.enum(['all', 'mine', 'unassigned']);

export async function workspaceRead<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal });
  if (!response.ok) throw new BookingReadError(response.status, 'READ_FAILED');
  return z.object({ data: schema, error: z.null() }).parse(await response.json()).data;
}
export const getCustomerBookings = (signal: AbortSignal) => workspaceRead('/api/v1/me/bookings', myBookingListOutput, signal);
export const getNotificationSummary = (signal: AbortSignal) => workspaceRead('/api/v1/notifications?unread=true&limit=3', notificationListOutput, signal);

export function getShopBookings(input: { shopId: string; page: number; assignee: z.infer<typeof assignee>; status?: string }, signal: AbortSignal) {
  const shopId = uuid.parse(input.shopId);
  const query = new URLSearchParams({ page: String(pageNumber.parse(input.page)) });
  if (input.status) query.set('status', bookingStatus.parse(input.status));
  query.set('assignee', assignee.parse(input.assignee));
  return workspaceRead(`/api/v1/shops/${shopId}/bookings?${query}`, shopBookingListOutput, signal);
}

export function getQcQueue(shopIdInput: string, pageInput: number, signal: AbortSignal) {
  const shopId = uuid.parse(shopIdInput);
  const page = pageNumber.parse(pageInput);
  return workspaceRead(`/api/v1/shops/${shopId}/qc-queue?page=${page}`, qcQueueOutput, signal);
}

export function getInventory(shopIdInput: string, pageInput: number, signal: AbortSignal) {
  const shopId = uuid.parse(shopIdInput);
  const page = pageNumber.parse(pageInput);
  return workspaceRead(`/api/v1/shops/${shopId}/inventory?page=${page}`, inventoryListOutput, signal);
}

export function getEstimateCatalog(bookingIdInput: string, pageInput: number, signal: AbortSignal) {
  const bookingId = uuid.parse(bookingIdInput);
  const page = pageNumber.parse(pageInput);
  return workspaceRead(`/api/v1/bookings/${bookingId}/estimate-catalog?page=${page}`, estimateCatalogOutput, signal);
}
