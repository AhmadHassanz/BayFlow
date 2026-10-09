import { z } from 'zod';
import { createBookingInput, bookingCreationOutput, type CreateBookingInput } from '@/lib/contracts/bookings';
import { bookingDetailOutput } from '@/lib/contracts/booking-actions';
import { membershipOutput } from '@/lib/contracts/auth';

export const meOutput = z.object({ user: z.object({ id: z.uuid(), fullName: z.string(), phone: z.string().nullable(), email: z.string().nullable() }), memberships: z.array(membershipOutput) });
export type BookingIdentity = z.infer<typeof meOutput>;
export type CreatedBooking = z.infer<typeof bookingCreationOutput>;

export class BookingReadError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function responseData<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    try {
      const value = z.object({ error: z.object({ code: z.string() }) }).parse(await response.json());
      code = value.error.code;
    } catch { /* Proxy/network errors need not be JSON. Never expose their body. */ }
    throw new BookingReadError(response.status, code);
  }
  return z.object({ data: schema, error: z.null() }).parse(await response.json()).data;
}

export async function getBookingIdentity(signal?: AbortSignal) {
  const response = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'same-origin', signal });
  if (response.status === 401) return null;
  return responseData(response, meOutput);
}

export async function submitBooking(input: CreateBookingInput, signal?: AbortSignal) {
  const payload = createBookingInput.parse(input);
  const response = await fetch('/api/v1/bookings', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const booking = await responseData(response, bookingCreationOutput);
  if (booking.shopId !== payload.shopId || booking.slotId !== payload.slotId) throw new Error('Unexpected booking response.');
  return booking;
}

export async function getBookingReceipt(id: string, signal?: AbortSignal) {
  return responseData(await fetch(`/api/v1/bookings/${z.uuid().parse(id)}`, { cache: 'no-store', credentials: 'same-origin', signal }), bookingDetailOutput);
}

export function bookingFailure(error: unknown) {
  if (!(error instanceof BookingReadError)) return 'We could not verify the result. Retry this same request to safely check whether your booking was created.';
  if (error.status === 401) return 'Your session has expired. Sign in again to finish this booking.';
  if (error.status === 403) return 'This account cannot book a customer visit. Use a customer account to continue.';
  if (error.status === 404) return 'The workshop or appointment is no longer available. Choose another appointment or workshop.';
  if (error.code === 'SLOT_CONFLICT') return 'That appointment is no longer available. Please choose another time.';
  if (error.code === 'VEHICLE_CONFLICT') return 'This registration plate already has different saved vehicle details. Check your make, model, year, colour and mileage.';
  if (error.code === 'IDEMPOTENCY_CONFLICT') return 'This request does not match the earlier attempt. Contact the workshop before starting another booking.';
  if (error.code === 'BOOKING_CONFLICT') return 'The workshop is handling another request. Retry this same booking in a moment.';
  if (error.status === 429) return 'Too many booking attempts. Wait a minute before retrying.';
  if (error.status === 400 || error.status === 422) return 'Check your services, symptoms and vehicle details before trying again.';
  return 'We could not verify the result. Retry this same request to safely check whether your booking was created.';
}

export function canReviseBooking(error: unknown) {
  return error instanceof BookingReadError && (['SLOT_CONFLICT', 'VEHICLE_CONFLICT', 'INVALID_INPUT', 'NOT_FOUND'].includes(error.code)
    || [400, 403, 404, 422].includes(error.status));
}
