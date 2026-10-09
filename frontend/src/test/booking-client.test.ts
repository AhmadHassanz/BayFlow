import { afterEach, expect, it, vi } from 'vitest';
import { getBookingIdentity, submitBooking, BookingReadError, bookingFailure, canReviseBooking } from '@/lib/api/booking';
import { bookingPayload, emptyBookingForm } from '@/lib/booking/draft';
import { serviceId, shopId, slotId } from './public-fixtures';
afterEach(() => vi.unstubAllGlobals());
const input = bookingPayload(shopId, { ...emptyBookingForm, slotId, serviceIds: [serviceId], registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: '2016' }, 'b1100000-0000-4000-8000-000000009001');
const booking = { id: input.idempotencyKey, shopId, slotId, vehicleId: input.idempotencyKey, customerId: input.idempotencyKey, status: 'PENDING', stateVersion: 0, symptomNotes: '', serviceIds: [serviceId], createdAt: '2026-10-10T00:00:00Z' };

it.each([200, 201])('submits one credentialled same-origin mutation and accepts authoritative %i responses', async status => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: booking, error: null }), { status }));
  vi.stubGlobal('fetch', fetcher);
  expect(await submitBooking(input)).toEqual(booking);
  expect(fetcher).toHaveBeenCalledWith('/api/v1/bookings', expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(input) }));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('customerId');
});

it('treats only a 401 identity response as signed out, rather than hiding a network failure', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockRejectedValueOnce(new TypeError('network'));
  vi.stubGlobal('fetch', fetcher);
  expect(await getBookingIdentity()).toBeNull();
  await expect(getBookingIdentity()).rejects.toThrow('network');
});

it.each(['SLOT_CONFLICT', 'VEHICLE_CONFLICT', 'BOOKING_CONFLICT', 'IDEMPOTENCY_CONFLICT'])('preserves the server error code %s without exposing its diagnostic', async code => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: null, error: { code, message: 'private diagnostic' } }), { status: 409 })));
  const error = await submitBooking(input).catch(error => error);
  expect(error).toMatchObject({ status: 409, code }); expect(bookingFailure(error)).not.toContain('private');
});

it('allows edits after authoritative slot/validation failures but locks uncertain attempts to their original key', () => {
  expect(canReviseBooking(new BookingReadError(409, 'SLOT_CONFLICT'))).toBe(true);
  expect(canReviseBooking(new BookingReadError(400, 'INVALID_INPUT'))).toBe(true);
  expect(canReviseBooking(new TypeError('network'))).toBe(false);
  expect(canReviseBooking(new BookingReadError(500, 'DATABASE_ERROR'))).toBe(false);
  expect(canReviseBooking(new BookingReadError(409, 'BOOKING_CONFLICT'))).toBe(false);
});

it('rejects a mismatched authoritative response instead of showing confirmation for another shop', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ...booking, shopId: input.idempotencyKey }, error: null }))));
  await expect(submitBooking(input)).rejects.toThrow('Unexpected booking response');
});
