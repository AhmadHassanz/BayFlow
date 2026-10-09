import 'server-only';
import { ApiError } from '@/lib/api/response';
import {
  bookingActionRpcOutput,
  bookingDetailOutput,
  myBookingListOutput,
  shopBookingListOutput,
  type BookingActionInput,
} from '@/lib/contracts/booking-actions';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export function bookingActionError(error: { code?: string }): never {
  if (error.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'This booking action is not permitted.');
  if (error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Booking or shop was not found.');
  if (error.code === '22023') throw new ApiError(400, 'INVALID_INPUT', 'Check the submitted action fields.');
  if (error.code === 'BF101') throw new ApiError(409, 'STATE_CONFLICT', 'Reload this booking.');
  if (error.code === 'BF102') throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Use a new request key for a different action.');
  if (error.code === 'BF103') throw new ApiError(422, 'ACTION_NOT_ALLOWED', 'This action is not allowed in the current state.');
  if (['40001', '40P01', '55P03'].includes(error.code ?? ''))
    throw new ApiError(409, 'BOOKING_CONFLICT', 'Retry this action with the same request key.');
  throw new ApiError(500, 'DATABASE_ERROR', 'The booking action could not be completed.');
}

export async function applyBookingAction(client: Client, bookingId: string, input: BookingActionInput) {
  const result = await client.rpc('apply_booking_action', { input: { bookingId, ...input } });
  if (result.error) bookingActionError(result.error);
  return bookingActionRpcOutput.parse(result.data);
}

export async function getBooking(client: Client, bookingId: string) {
  const result = await client.rpc('get_booking', { input: { bookingId } });
  if (result.error) bookingActionError(result.error);
  return bookingDetailOutput.parse(result.data);
}

export async function listMyBookings(client: Client) {
  const result = await client.rpc('list_my_bookings', { input: {} });
  if (result.error) bookingActionError(result.error);
  return myBookingListOutput.parse(result.data);
}

export async function listShopBookings(
  client: Client,
  input: { shopId: string; status?: string; assignee: string; page: number },
) {
  const result = await client.rpc('list_shop_bookings', { input });
  if (result.error) bookingActionError(result.error);
  return shopBookingListOutput.parse(result.data);
}
