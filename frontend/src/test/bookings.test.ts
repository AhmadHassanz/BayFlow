import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { createBookingInput } from '@/lib/contracts/bookings';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), create: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/services/bookings', () => ({ createBooking: mocks.create }));
vi.mock('@/server/permissions/booking-rate-limit', () => ({ limitBookingCreation: mocks.limit }));
import { POST } from '@/app/api/v1/bookings/route';

const id = 'b0500000-0000-4000-8000-000000000001';
const input = { shopId: id, slotId: id, serviceIds: [id],
  vehicle: { registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016 }, idempotencyKey: id };
const booking = { id, shopId: id, slotId: id, vehicleId: id, customerId: id, status: 'PENDING',
  stateVersion: 0, symptomNotes: '', serviceIds: [id], createdAt: '2026-10-09T10:00:00Z' };
const request = (body: unknown = input, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/v1/bookings', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ client: {}, user: { id } });
  mocks.create.mockResolvedValue({ booking, replayed: false });
});
it('normalizes vehicle text and defaults while permitting known-service or meaningful symptom-only input', () => {
  expect(createBookingInput.parse({ ...input, vehicle: { ...input.vehicle, registrationPlate: ' lea-1234 ' } }))
    .toMatchObject({ symptomNotes: '', vehicle: { registrationPlate: 'LEA-1234', color: null, mileageKm: null } });
  expect(createBookingInput.parse({ ...input, serviceIds: [], symptomNotes: 'Brake squeaks when stopping.' }).serviceIds).toEqual([]);
});
it.each([
  { customerId: id }, { status: 'COMPLETED' }, { role: 'OWNER' }, { capacityRemaining: 99 }, { password: 'secret' },
  { shopId: 'bad' }, { slotId: null }, { idempotencyKey: 'bad' }, { serviceIds: [id, id] },
  { serviceIds: [], symptomNotes: '' }, { serviceIds: [], symptomNotes: '.........a' }, { symptomNotes: null },
  { symptomNotes: 'x'.repeat(4001) }, { serviceIds: [1] },
  { vehicle: { ...input.vehicle, id } }, { vehicle: { ...input.vehicle, customerId: id } },
  { vehicle: { ...input.vehicle, registrationPlate: '?!' } }, { vehicle: { ...input.vehicle, make: '' } },
  { vehicle: { ...input.vehicle, year: 2016.5 } }, { vehicle: { ...input.vehicle, year: 1885 } },
  { vehicle: { ...input.vehicle, mileageKm: -1 } }, { vehicle: { ...input.vehicle, mileageKm: 2147483648 } },
])('rejects unsafe booking input %j before writes', async patch => {
  expect((await POST(request({ ...input, ...patch }))).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('sorts service IDs and detects duplicates despite UUID casing', () => {
  const other = 'b0500000-0000-4000-8000-000000000002';
  expect(createBookingInput.parse({ ...input, serviceIds: [other, id] }).serviceIds).toEqual([id, other]);
  expect(createBookingInput.safeParse({ ...input, serviceIds: [id, id.toUpperCase()] }).success).toBe(false);
});
it('verified session is required and no customer ID comes from the caller', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in.'));
  const response = await POST(request()); expect(response.status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
});
it('rejects missing/cross origin before identity or mutation', async () => {
  for (const origin of ['', 'https://attacker.test']) expect((await POST(request(input, origin))).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it('creation returns 201 and replay returns 200 with authoritative booking and no-store', async () => {
  let response = await POST(request()); expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data: booking, error: null });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.limit).toHaveBeenCalledWith(id);
  expect(mocks.create).toHaveBeenCalledWith({}, createBookingInput.parse(input));
  mocks.create.mockResolvedValue({ booking: { ...booking, status: 'CONFIRMED', stateVersion: 1 }, replayed: true });
  response = await POST(request()); expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({ status: 'CONFIRMED', stateVersion: 1 });
});
it('malformed/oversize JSON and safe conflicts never expose database text', async () => {
  const malformed = new Request('http://localhost:3000/api/v1/bookings', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{' });
  expect((await POST(malformed)).status).toBe(400);
  expect((await POST(request({ ...input, symptomNotes: 'x'.repeat(17000) }))).status).toBe(400);
  mocks.create.mockRejectedValue(new ApiError(409, 'SLOT_CONFLICT', 'Choose another slot.'));
  const response = await POST(request()); expect(response.status).toBe(409);
  const body = await response.json();
  expect(body).toMatchObject({ data: null, error: { code: 'SLOT_CONFLICT', message: 'Choose another slot.' } });
  expect(response.headers.get('x-request-id')).toBe(body.error.details.requestId);
});
it('rate-limit denial never reaches booking writes', async () => {
  mocks.limit.mockImplementation(() => { throw new ApiError(429, 'RATE_LIMITED', 'Try later.'); });
  expect((await POST(request())).status).toBe(429); expect(mocks.create).not.toHaveBeenCalled();
});
