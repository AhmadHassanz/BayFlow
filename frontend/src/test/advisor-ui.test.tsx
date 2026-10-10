// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdvisorInbox } from '@/components/advisor/AdvisorInbox';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';
import { advisorActions, type JobRecord } from '@/lib/booking/advisor-actions';
import { bookingDetailOutput } from '@/lib/contracts/booking-actions';
const shopId = 'b1100000-0000-4000-8000-000000001001';
const id = 'b1100000-0000-4000-8000-000000000101';
const tech = 'b1100000-0000-4000-8000-000000000004';
const base = bookingDetailOutput.parse({ id, shopId, customerId: tech, vehicleId: tech, slotId: tech,
  status: 'PENDING', stateVersion: 0, symptomNotes: 'Brake pedal is soft', serviceIds: [], createdAt: '2026-10-10T10:00:00Z',
  technicianUserId: null, partsUserId: null, qcClaimedBy: null, completedAt: null, history: [] });
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data, error: null }), { status });
const fail = (status: number, code: string) => new Response(JSON.stringify({ data: null, error: { code, message: 'PRIVATE' } }), { status });
function record(role: 'SA' | 'TECHNICIAN' | 'QC' = 'SA') {
  return render(<StaffBookingRecord id={id} shopId={shopId} role={role} returnTo={`/shops/${shopId}/bookings/${id}`} />);
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('uses live stage queries for new, estimate and pickup desks and resets pagination', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok({ items: [], page: 1, pageSize: 50 }));
  vi.stubGlobal('fetch', fetcher);
  render(<AdvisorInbox shopId={shopId} role="SA" />);
  await screen.findByText('A clear workbench.');
  for (const [label, status] of [['New jobs', 'PENDING'], ['Estimate work', 'ESTIMATE_REVIEW'], ['Pickup work', 'READY_FOR_PICKUP']]) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`page=1&status=${status}&assignee=all`), expect.anything()));
    await screen.findByText('A clear workbench.');
  }
  fireEvent.change(screen.getByLabelText('Booking stage'), { target: { value: 'COMPLETED' } });
  await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('status=COMPLETED'), expect.anything()));
});
it('confirms once, authoritatively refetches and survives reload with actual history', async () => {
  let booking = base;
  let resolveSave: (response: Response) => void = () => {};
  const fetcher = vi.fn().mockImplementation((url: string, options: RequestInit) => {
    if (options.method === 'POST') return new Promise<Response>(resolve => { resolveSave = resolve; });
    if (url.includes('/team')) return Promise.resolve(ok({ items: [{ userId: tech, fullName: 'Mechanic' }], page: 1, pageSize: 50, total: 1 }));
    return Promise.resolve(ok(booking));
  });
  vi.stubGlobal('fetch', fetcher);
  const view = record();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  const confirm = screen.getByRole('button', { name: 'Confirm change' });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  const payload = JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string);
  expect(payload).toMatchObject({ action: 'CONFIRM_BOOKING', expectedVersion: 0, payload: {} });
  expect(payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  booking = { ...base, status: 'CONFIRMED', stateVersion: 1, history: [{ id: tech, actorUserId: tech, action: 'CONFIRM_BOOKING', fromStatus: 'PENDING', toStatus: 'CONFIRMED', note: 'Accepted at service desk', createdAt: base.createdAt }] };
  resolveSave(ok(booking, 201));
  await screen.findByText('Accepted at service desk');
  await screen.findByRole('option', { name: 'Mechanic' });
  view.unmount(); record();
  await screen.findByText('Accepted at service desk');
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
});
it('assigns a real technician ID after confirmation', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => url.includes('/team')
    ? ok({ items: [{ userId: tech, fullName: 'Mechanic' }], page: 1, pageSize: 50, total: 1 })
    : ok({ ...base, status: options.method === 'POST' ? 'ASSIGNED' : 'CONFIRMED', stateVersion: 1 }));
  vi.stubGlobal('fetch', fetcher); record();
  await screen.findByRole('option', { name: 'Mechanic' });
  expect(screen.getByRole('button', { name: 'Assign technician' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Active technician'), { target: { value: tech } });
  fireEvent.click(screen.getByRole('button', { name: 'Assign technician' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true));
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string))
    .toMatchObject({ action: 'ASSIGN_TECHNICIAN', expectedVersion: 1, payload: { technicianUserId: tech } });
});
it('records a meaningful cancellation reason and supports conservative dismissal', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok(base)); vi.stubGlobal('fetch', fetcher); record();
  await screen.findByText('Move the visit forward.');
  fireEvent.click(screen.getByText('Cancel this visit'));
  expect(screen.getByRole('button', { name: 'Cancel booking' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: '  Customer cannot attend  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true));
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string).payload)
    .toEqual({ reason: 'Customer cannot attend' });
});
it('retries uncertain results with the identical intent and locks dismissal/new requests', async () => {
  let posts = 0;
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === 'POST' && ++posts === 1) throw new Error('lost response');
    return ok(base);
  });
  vi.stubGlobal('fetch', fetcher); record();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/The result is uncertain/);
  expect(screen.getByRole('button', { name: 'Keep as is' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
  await waitFor(() => expect(posts).toBe(2));
  const calls = fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(calls[0][1].body).toBe(calls[1][1].body);
});
it.each([[409, 'STATE_CONFLICT'], [422, 'ACTION_NOT_ALLOWED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [401, 'UNAUTHENTICATED']])
  ('handles %i %s with safe guidance and authoritative reload', async (status, code) => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST' ? fail(status, code) : ok(base));
    vi.stubGlobal('fetch', fetcher); record();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    const reload = await screen.findByRole('button', { name: 'Reload record' });
    expect(screen.queryByText('PRIVATE')).toBeNull();
    if (status === 401) expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toContain('next=');
    fireEvent.click(reload);
    await screen.findByRole('button', { name: 'Confirm booking' });
    expect(fetcher.mock.calls.filter(([, options]) => options.method !== 'POST').length).toBeGreaterThan(1);
  });
it('does not expose advisor actions to other roles, terminal or previously repaired bookings', () => {
  expect(advisorActions(base, 'TECHNICIAN')).toEqual([]);
  for (const status of ['COMPLETED', 'CANCELLED', 'IN_REPAIR', 'QC_PENDING', 'READY_FOR_PICKUP'] as const)
    expect(advisorActions({ ...base, status }, 'SA')).toEqual([]);
  const priorRepair = { ...base, status: 'PARTS_READY', history: [{ toStatus: 'IN_REPAIR' }] } as JobRecord;
  expect(advisorActions(priorRepair, 'SA')).toEqual([]);
});
it('suppresses foreign-shop records before presenting mutation controls', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ ...base, shopId: tech }))); record();
  await screen.findByText('Record unavailable.');
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
});
