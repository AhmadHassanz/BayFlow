import { expect, it, vi } from 'vitest';
import { createBooking, bookingError } from '@/server/services/bookings';
import { limitBookingCreation } from '@/server/permissions/booking-rate-limit';
import { createBookingInput } from '@/lib/contracts/bookings';
import type { createClient } from '@/lib/supabase/server';

const id = 'b0500000-0000-4000-8000-000000000001';
it.each([['42501',403,'FORBIDDEN'], ['P0002',404,'NOT_FOUND'], ['22023',400,'INVALID_INPUT'],
  ['BF001',409,'SLOT_CONFLICT'], ['BF002',409,'IDEMPOTENCY_CONFLICT'], ['BF003',409,'VEHICLE_CONFLICT'],
  ['40001',409,'BOOKING_CONFLICT'], ['40P01',409,'BOOKING_CONFLICT'], ['55P03',409,'BOOKING_CONFLICT'],
  ['unknown',500,'DATABASE_ERROR']])('maps SQL %s to safe HTTP %i', (code,status,apiCode) => {
  expect(() => bookingError({ code })).toThrow(expect.objectContaining({ status, code: apiCode }));
});
it('executes exactly one user-scoped RPC and returns the authoritative narrow DTO', async () => {
  const input = createBookingInput.parse({ shopId: id, slotId: id, serviceIds: [], symptomNotes: 'Engine stalls while idle.',
    vehicle: { registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016 }, idempotencyKey: id });
  const booking = { id, shopId: id, customerId: id, vehicleId: id, slotId: id, status: 'PENDING', stateVersion: 0,
    symptomNotes: input.symptomNotes, serviceIds: [], createdAt: '2026-10-09T10:00:00Z' };
  const rpc = vi.fn().mockResolvedValue({ data: { booking: { ...booking, raw_app_meta_data: 'private' }, replayed: false }, error: null });
  const client = { rpc } as unknown as Awaited<ReturnType<typeof createClient>>;
  expect(await createBooking(client, input)).toEqual({ booking, replayed: false });
  expect(rpc).toHaveBeenCalledExactlyOnceWith('create_booking', { input });
  rpc.mockResolvedValue({ data: null, error: { code: 'BF001', message: 'PRIVATE SQL ERROR' } });
  await expect(createBooking(client,input)).rejects.toMatchObject({ status: 409, code: 'SLOT_CONFLICT' });
});
it('booking limiter bounds per-identity requests and expires buckets after one minute', () => {
  const actor = 'booking-rate-test';
  for (let i = 0; i < 30; i++) limitBookingCreation(actor, 1000);
  expect(() => limitBookingCreation(actor, 1001)).toThrow(expect.objectContaining({ status: 429 }));
  expect(() => limitBookingCreation('other-customer', 1001)).not.toThrow();
  expect(() => limitBookingCreation(actor, 61000)).not.toThrow();
});
