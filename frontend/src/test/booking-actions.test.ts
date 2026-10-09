import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { bookingActionInput, shopBookingListQuery } from '@/lib/contracts/booking-actions';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  apply: vi.fn(),
  get: vi.fn(),
  myList: vi.fn(),
  shopList: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/services/booking-actions', () => ({
  applyBookingAction: mocks.apply,
  getBooking: mocks.get,
  listMyBookings: mocks.myList,
  listShopBookings: mocks.shopList,
}));

import { POST } from '@/app/api/v1/bookings/[id]/actions/route';
import { GET as getBooking } from '@/app/api/v1/bookings/[id]/route';
import { GET as getMine } from '@/app/api/v1/me/bookings/route';
import { GET as getShop } from '@/app/api/v1/shops/[id]/bookings/route';

const id = 'b0600000-0000-4000-8000-000000000001';
const tech = 'b0600000-0000-4000-8000-000000000002';
const booking = {
  id, shopId: id, slotId: id, vehicleId: id, customerId: id, status: 'CONFIRMED', stateVersion: 1,
  symptomNotes: '', serviceIds: [id], createdAt: '2026-10-09T10:00:00Z', completedAt: null,
  technicianUserId: null, partsUserId: null, qcClaimedBy: null, history: [],
};
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown, origin = 'http://localhost:3000') =>
  new Request(`http://localhost:3000/api/v1/bookings/${id}/actions`, {
    method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue({ client: {}, user: { id } });
  mocks.apply.mockResolvedValue({ booking, replayed: false });
  mocks.get.mockResolvedValue(booking);
  mocks.myList.mockResolvedValue([booking]);
  mocks.shopList.mockResolvedValue({ items: [booking], page: 1, pageSize: 50 });
});

it('validates each B06 action shape before calling the service', () => {
  expect(bookingActionInput.parse({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }))
    .toMatchObject({ payload: {} });
  const assign = bookingActionInput.parse({ action: 'ASSIGN_TECHNICIAN', expectedVersion: 1, idempotencyKey: id,
    payload: { technicianUserId: tech.toUpperCase() } });
  expect(assign.action).toBe('ASSIGN_TECHNICIAN');
  if (assign.action === 'ASSIGN_TECHNICIAN') expect(assign.payload.technicianUserId).toBe(tech);
  expect(bookingActionInput.parse({ action: 'START_INSPECTION', expectedVersion: 2, idempotencyKey: id }))
    .toMatchObject({ payload: {} });
  const cancel = bookingActionInput.parse({ action: 'CANCEL_BOOKING', expectedVersion: 0, idempotencyKey: id,
    payload: { reason: '  Customer changed plans  ' } });
  expect(cancel.action).toBe('CANCEL_BOOKING');
  if (cancel.action === 'CANCEL_BOOKING') expect(cancel.payload.reason).toBe('Customer changed plans');
});

it.each([
  { action: 'SET_STATUS', expectedVersion: 0, idempotencyKey: id, payload: { status: 'COMPLETED' } },
  { action: 'CONFIRM_BOOKING', expectedVersion: -1, idempotencyKey: id },
  { action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: 'bad' },
  { action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id, payload: { nextStatus: 'CONFIRMED' } },
  { action: 'ASSIGN_TECHNICIAN', expectedVersion: 1, idempotencyKey: id, payload: { technicianUserId: 'bad' } },
  { action: 'CANCEL_BOOKING', expectedVersion: 0, idempotencyKey: id, payload: { reason: 'no' } },
])('rejects unsafe action input %j', async body => {
  const response = await POST(request(body), context);
  expect(response.status).toBe(400);
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('requires same-origin and identity for mutations', async () => {
  expect((await POST(request({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }, 'https://bad.test'), context)).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in.'));
  expect((await POST(request({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }), context)).status).toBe(401);
});

it('returns 201 for new action and 200 for idempotent replay', async () => {
  let response = await POST(request({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }), context);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data: booking, error: null });
  expect(mocks.apply).toHaveBeenCalledWith({}, id, { action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id, payload: {} });
  mocks.apply.mockResolvedValue({ booking: { ...booking, stateVersion: 2 }, replayed: true });
  response = await POST(request({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }), context);
  expect(response.status).toBe(200);
});

it('maps service conflicts without exposing database details', async () => {
  mocks.apply.mockRejectedValue(new ApiError(409, 'STATE_CONFLICT', 'Reload this booking.'));
  const response = await POST(request({ action: 'CONFIRM_BOOKING', expectedVersion: 0, idempotencyKey: id }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ data: null, error: { code: 'STATE_CONFLICT', message: 'Reload this booking.' } });
});

it('reads booking detail and customer booking list through verified identity', async () => {
  expect((await getBooking(new Request(`http://localhost:3000/api/v1/bookings/${id}`), context)).status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith({}, id);
  expect((await getMine()).status).toBe(200);
  expect(mocks.myList).toHaveBeenCalledWith({});
});

it('parses shop booking filters and rejects unknown query keys', async () => {
  expect(shopBookingListQuery.parse({ status: 'PENDING', assignee: 'mine', page: '2' })).toEqual({
    status: 'PENDING', assignee: 'mine', page: 2,
  });
  let response = await getShop(new Request(`http://localhost:3000/api/v1/shops/${id}/bookings?status=CONFIRMED&assignee=mine&page=2`), context);
  expect(response.status).toBe(200);
  expect(mocks.shopList).toHaveBeenCalledWith({}, { shopId: id, status: 'CONFIRMED', assignee: 'mine', page: 2 });
  response = await getShop(new Request(`http://localhost:3000/api/v1/shops/${id}/bookings?role=OWNER`), context);
  expect(response.status).toBe(400);
});
