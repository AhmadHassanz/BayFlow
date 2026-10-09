import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { bookingActionInput, shopBookingListQuery } from '@/lib/contracts/booking-actions';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  apply: vi.fn(),
  get: vi.fn(),
  myList: vi.fn(),
  shopList: vi.fn(),
  qcQueue: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/services/booking-actions', () => ({
  applyBookingAction: mocks.apply,
  getBooking: mocks.get,
  listMyBookings: mocks.myList,
  listShopBookings: mocks.shopList,
  listQcQueue: mocks.qcQueue,
}));

import { POST } from '@/app/api/v1/bookings/[id]/actions/route';
import { GET as getBooking } from '@/app/api/v1/bookings/[id]/route';
import { GET as getMine } from '@/app/api/v1/me/bookings/route';
import { GET as getShop } from '@/app/api/v1/shops/[id]/bookings/route';
import { GET as getQcQueue } from '@/app/api/v1/shops/[id]/qc-queue/route';

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
  mocks.qcQueue.mockResolvedValue({ items: [booking], page: 1, pageSize: 50 });
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


it('validates B07 estimate action shapes and rejects author-supplied totals', () => {
  const estimate = {
    diagnosisNote: 'Brake pads are below safe operating thickness.',
    items: [
      { kind: 'PART' as const, partId: tech.toUpperCase(), descriptionSnapshot: 'Brake pads', quantity: 2, unitPricePkr: 1500 },
      { kind: 'LABOUR' as const, descriptionSnapshot: 'Brake labour', quantity: 1, unitPricePkr: 2500 },
    ],
  };
  const submittedEstimate = bookingActionInput.parse({ action: 'SUBMIT_ESTIMATE', expectedVersion: 3, idempotencyKey: id, payload: estimate });
  expect(submittedEstimate.action).toBe('SUBMIT_ESTIMATE');
  if (submittedEstimate.action === 'SUBMIT_ESTIMATE') expect(submittedEstimate.payload.items[0])
    .toMatchObject({ partId: tech, quantity: 2 });
  expect(bookingActionInput.parse({ action: 'SEND_ESTIMATE', expectedVersion: 4, idempotencyKey: id, payload: estimate }).action)
    .toBe('SEND_ESTIMATE');
  expect(bookingActionInput.parse({ action: 'APPROVE_ESTIMATE', expectedVersion: 5, idempotencyKey: id }))
    .toMatchObject({ payload: {} });
  const rejection = bookingActionInput.parse({ action: 'REJECT_ESTIMATE', expectedVersion: 5, idempotencyKey: id, payload: { reason: '  Too expensive  ' } });
  expect(rejection.action).toBe('REJECT_ESTIMATE');
  if (rejection.action === 'REJECT_ESTIMATE') expect(rejection.payload.reason).toBe('Too expensive');
  expect(bookingActionInput.parse({ action: 'REVISE_ESTIMATE', expectedVersion: 6, idempotencyKey: id, payload: estimate }).action)
    .toBe('REVISE_ESTIMATE');
  expect(() => bookingActionInput.parse({ action: 'SUBMIT_ESTIMATE', expectedVersion: 3, idempotencyKey: id,
    payload: { ...estimate, subtotalPkr: 1 } })).toThrow();
  expect(() => bookingActionInput.parse({ action: 'SUBMIT_ESTIMATE', expectedVersion: 3, idempotencyKey: id,
    payload: { diagnosisNote: 'Bad labour item', items: [{ kind: 'LABOUR', partId: tech, descriptionSnapshot: 'Labour', quantity: 1, unitPricePkr: 1 }] } })).toThrow();
});

it('validates B09 repair, QC and pickup action shapes', () => {
  const repair = bookingActionInput.parse({ action: 'COMPLETE_REPAIR', expectedVersion: 9, idempotencyKey: id,
    payload: { notes: '  Replaced belt and road tested  ' } });
  expect(repair.action).toBe('COMPLETE_REPAIR');
  if (repair.action === 'COMPLETE_REPAIR') expect(repair.payload.notes).toBe('Replaced belt and road tested');
  expect(bookingActionInput.parse({ action: 'CLAIM_QC', expectedVersion: 10, idempotencyKey: id })).toMatchObject({ payload: {} });
  const pass = bookingActionInput.parse({ action: 'PASS_QC', expectedVersion: 11, idempotencyKey: id,
    payload: { checklist: { roadTest: true }, notes: ' Passed ' } });
  expect(pass.action).toBe('PASS_QC');
  if (pass.action === 'PASS_QC') expect(pass.payload.notes).toBe('Passed');
  const fail = bookingActionInput.parse({ action: 'FAIL_QC', expectedVersion: 11, idempotencyKey: id,
    payload: { checklist: { leakCheck: false }, title: ' Leak ', description: ' Leak remains ' } });
  expect(fail.action).toBe('FAIL_QC');
  if (fail.action === 'FAIL_QC') expect(fail.payload.title).toBe('Leak');
  expect(bookingActionInput.parse({ action: 'NOTIFY_READY', expectedVersion: 12, idempotencyKey: id })).toMatchObject({ payload: {} });
  expect(bookingActionInput.parse({ action: 'COMPLETE_PICKUP', expectedVersion: 12, idempotencyKey: id })).toMatchObject({ payload: {} });
  expect(() => bookingActionInput.parse({ action: 'COMPLETE_REPAIR', expectedVersion: 9, idempotencyKey: id, payload: { notes: 'no' } })).toThrow();
  expect(() => bookingActionInput.parse({ action: 'PASS_QC', expectedVersion: 11, idempotencyKey: id, payload: { checklist: [] } })).toThrow();
  expect(() => bookingActionInput.parse({ action: 'FAIL_QC', expectedVersion: 11, idempotencyKey: id, payload: { checklist: {}, title: '', description: 'bad' } })).toThrow();
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

it('reads the QC queue through verified QC identity and rejects unknown query keys', async () => {
  let response = await getQcQueue(new Request(`http://localhost:3000/api/v1/shops/${id}/qc-queue?page=2`), context);
  expect(response.status).toBe(200);
  expect(mocks.qcQueue).toHaveBeenCalledWith({}, id, 2);
  response = await getQcQueue(new Request(`http://localhost:3000/api/v1/shops/${id}/qc-queue?status=QC_PENDING`), context);
  expect(response.status).toBe(400);
});

