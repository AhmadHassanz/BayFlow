import { z } from 'zod';
import { BookingReadError } from './booking';
import { myBookingListOutput } from '@/lib/contracts/booking-actions';
import { notificationListOutput } from '@/lib/contracts/notifications';

export async function workspaceRead<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal });
  if (!response.ok) throw new BookingReadError(response.status, 'READ_FAILED');
  return z.object({ data: schema, error: z.null() }).parse(await response.json()).data;
}
export const getCustomerBookings = (signal: AbortSignal) => workspaceRead('/api/v1/me/bookings', myBookingListOutput, signal);
export const getNotificationSummary = (signal: AbortSignal) => workspaceRead('/api/v1/notifications?unread=true&limit=3', notificationListOutput, signal);
