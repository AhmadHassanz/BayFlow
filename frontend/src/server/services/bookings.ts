import 'server-only';
import { ApiError } from '@/lib/api/response';
import { bookingRpcOutput, type CreateBookingInput } from '@/lib/contracts/bookings';
import type { createClient } from '@/lib/supabase/server';

export function bookingError(error: { code?: string }): never {
  if (error.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'Booking creation is not permitted.');
  if (error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Shop or appointment was not found.');
  if (error.code === '22023') throw new ApiError(400, 'INVALID_INPUT', 'Check the vehicle, services and symptoms.');
  if (error.code === 'BF001') throw new ApiError(409, 'SLOT_CONFLICT', 'This appointment is no longer available. Choose another slot.');
  if (error.code === 'BF002') throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Use a new request key for a different booking.');
  if (error.code === 'BF003') throw new ApiError(409, 'VEHICLE_CONFLICT', 'Use the saved details for this vehicle.');
  if (['40001', '40P01', '55P03'].includes(error.code ?? ''))
    throw new ApiError(409, 'BOOKING_CONFLICT', 'Retry this booking with the same request key.');
  throw new ApiError(500, 'DATABASE_ERROR', 'The booking could not be created.');
}
export async function createBooking(client: Awaited<ReturnType<typeof createClient>>, input: CreateBookingInput) {
  const result = await client.rpc('create_booking', { input });
  if (result.error) bookingError(result.error);
  return bookingRpcOutput.parse(result.data);
}
