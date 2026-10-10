// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';
import { BookingRecord } from '@/components/workspace/BookingRecord';
import { QcDesk } from '@/components/qc/QcDesk';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { partsBooking } from './parts-desk-fixtures';
import { estimateShop as shopId, estimateBooking as id, estimateCustomer as customerId, estimatePart as techId, estimateTime as time } from './estimate-fixtures';
const qcA = 'b1100000-0000-4000-8000-000000000014';
const qcB = 'b1100000-0000-4000-8000-000000000024';
const runId = 'b1100000-0000-4000-8000-000000005001';
const base: JobRecord = { ...partsBooking, status: 'QC_PENDING', stateVersion: 11 };
const run = { id: runId, bookingId: id, shopId, inspectorUserId: qcA, startedAt: time, finishedAt: null, passed: null, checklist: {}, notes: '', createdAt: time, updatedAt: time };
const claimed: JobRecord = { ...base, status: 'QC_IN_PROGRESS', stateVersion: 12, qcClaimedBy: qcA, qcRuns: [run] };
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
function staff(role: 'QC' | 'TECHNICIAN' | 'SA', actorId = qcA) {
  return render(<StaffBookingRecord id={id} shopId={shopId} role={role} actorId={actorId} returnTo={`/shops/${shopId}/bookings/${id}`} />);
}
function customer() { return render(<BookingRecord id={id} customerId={customerId} returnTo={`/customer/bookings/${id}`} />); }
function check(result: 'PASS' | 'FAIL') {
  fireEvent.change(screen.getByLabelText('Check 1 name'), { target: { value: 'Leak check' } });
  fireEvent.change(screen.getByLabelText('Check 1 result'), { target: { value: result } });
}
beforeEach(() => {
  mocks.push.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('completes QC fail → original-tech rework → second inspector pass → notice → customer pickup with persistent history', async () => {
  let current = structuredClone(base);
  let actor = qcA;
  const actions: string[] = [];
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method !== 'POST') return ok(current);
    const input = JSON.parse(options.body as string); expect(input.expectedVersion).toBe(current.stateVersion); actions.push(input.action);
    const before = current.status;
    if (input.action === 'CLAIM_QC') {
      current = { ...current, status: 'QC_IN_PROGRESS', qcClaimedBy: actor, qcRuns: [...current.qcRuns, { ...run, id: crypto.randomUUID(), inspectorUserId: actor }] };
    } else if (input.action === 'FAIL_QC') {
      const active = current.qcRuns.find(item => item.finishedAt === null)!;
      current = { ...current, status: 'IN_REPAIR', qcClaimedBy: null, qcRuns: current.qcRuns.map(item => item.id === active.id ? { ...item, finishedAt: time, passed: false, checklist: input.payload.checklist, notes: input.payload.notes } : item),
        qcIssues: [{ id: crypto.randomUUID(), bookingId: id, shopId, qcRunId: active.id, reportedBy: actor, title: input.payload.title, description: input.payload.description, createdAt: time, updatedAt: time, resolvedAt: null }] };
    } else if (input.action === 'COMPLETE_REPAIR') {
      current = { ...current, status: 'QC_PENDING', qcIssues: current.qcIssues.map(issue => ({ ...issue, resolvedAt: time })) };
    } else if (input.action === 'PASS_QC') {
      current = { ...current, status: 'READY_FOR_PICKUP', qcClaimedBy: null, qcRuns: current.qcRuns.map(item => item.finishedAt === null ? { ...item, finishedAt: time, passed: true, checklist: input.payload.checklist } : item) };
    } else if (input.action === 'COMPLETE_PICKUP') current = { ...current, status: 'COMPLETED', completedAt: time };
    current = { ...current, stateVersion: current.stateVersion + (input.action === 'NOTIFY_READY' ? 0 : 1), history: [...current.history, { id: crypto.randomUUID(), actorUserId: actor, action: input.action, fromStatus: before, toStatus: current.status, note: input.payload.notes ?? null, createdAt: time }] };
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher);
  let view = staff('QC');
  fireEvent.click(await screen.findByRole('button', { name: 'Claim quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Record inspection checks' }));
  expect(screen.getByRole('button', { name: 'Pass quality inspection' }).matches(':disabled')).toBe(true);
  check('FAIL'); fireEvent.change(screen.getByLabelText('Issue title'), { target: { value: 'Leak remains' } });
  fireEvent.change(screen.getByLabelText('Issue description'), { target: { value: 'Fluid leak after warm-up' } });
  fireEvent.click(screen.getByRole('button', { name: 'Fail quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/shops/${shopId}/qc`));
  expect(current.technicianUserId).toBe(techId); view.unmount(); actor = techId;
  view = staff('TECHNICIAN', techId); await screen.findAllByText('Fluid leak after warm-up');
  fireEvent.change(screen.getByLabelText('Repair notes'), { target: { value: 'Replaced seal and pressure tested' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resubmit repair for QC' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Resolved on resubmission'); view.unmount(); actor = qcB; mocks.push.mockReset();
  view = staff('QC', qcB); fireEvent.click(await screen.findByRole('button', { name: 'Claim quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Record inspection checks' })); check('PASS');
  fireEvent.click(screen.getByRole('button', { name: 'Pass quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/shops/${shopId}/qc`));
  expect(current.qcRuns).toHaveLength(2); expect(current.qcRuns[0].passed).toBe(false); expect(current.qcRuns[1].passed).toBe(true);
  expect(screen.queryByRole('button', { name: 'Pass quality inspection' })).toBeNull(); view.unmount();
  view = staff('SA'); fireEvent.click(await screen.findByRole('button', { name: 'Notify customer ready' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/Ready notice recorded/); view.unmount(); view = staff('SA');
  await screen.findByText(/Ready notice recorded/); expect(screen.queryByRole('button', { name: 'Notify customer ready' })).toBeNull(); view.unmount();
  view = customer(); fireEvent.click(await screen.findByRole('button', { name: 'Confirm vehicle pickup' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('heading', { name: 'Completed', level: 2 }); expect(current.completedAt).toBe(time);
  expect(actions).toEqual(['CLAIM_QC', 'FAIL_QC', 'COMPLETE_REPAIR', 'CLAIM_QC', 'PASS_QC', 'NOTIFY_READY', 'COMPLETE_PICKUP']);
  view.unmount(); customer(); await screen.findByRole('heading', { name: 'Completed', level: 2 });
  expect(screen.queryByRole('button', { name: 'Confirm vehicle pickup' })).toBeNull();
});
it.each([404, 409])('handles a losing/changed claim HTTP %i without exposing a claimed job', async status => {
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST'
    ? new Response(JSON.stringify({ error: { code: status === 409 ? 'STATE_CONFLICT' : 'NOT_FOUND', message: 'PRIVATE' } }), { status }) : ok(base));
  vi.stubGlobal('fetch', fetcher); staff('QC');
  fireEvent.click(await screen.findByRole('button', { name: 'Claim quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/This inspection changed or is no longer available/);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh quality desk' }));
  expect(mocks.push).toHaveBeenCalledWith(`/shops/${shopId}/qc`); expect(screen.queryByText('PRIVATE')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pass quality inspection' })).toBeNull();
});
it('uses separate real unclaimed and own-claimed queries and rejects unexpected queue records', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => ok({ items: [url.includes('qc-queue') ? base : claimed], page: 1, pageSize: 50 }));
  vi.stubGlobal('fetch', fetcher); const view = render(<QcDesk shopId={shopId} actorId={qcA} />);
  await screen.findByRole('link', { name: 'Review and claim' });
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/shops/${shopId}/qc-queue?page=1`, expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'My claimed inspections' })); await screen.findByRole('link', { name: 'Continue inspection' });
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('page=1&status=QC_IN_PROGRESS&assignee=mine'), expect.anything()); view.unmount();
  fetcher.mockImplementation(async () => ok({ items: [{ ...claimed, qcClaimedBy: qcB }], page: 1, pageSize: 50 })); render(<QcDesk shopId={shopId} actorId={qcA} />);
  await screen.findByRole('button', { name: /Try again/ }); expect(screen.queryByRole('link', { name: 'Review and claim' })).toBeNull();
});
it('requires explicit check results and written failure, and retains checks through focus refresh', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(claimed))); staff('QC');
  fireEvent.click(await screen.findByRole('button', { name: 'Record inspection checks' }));
  expect((screen.getByLabelText('Check 1 result') as HTMLSelectElement).value).toBe('');
  expect(screen.getByRole('button', { name: 'Pass quality inspection' }).matches(':disabled')).toBe(true);
  check('FAIL'); expect(screen.getByRole('button', { name: 'Fail quality inspection' }).matches(':disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Issue title'), { target: { value: 'Leak' } }); fireEvent.change(screen.getByLabelText('Issue description'), { target: { value: 'Leak after test' } });
  expect(screen.getByRole('button', { name: 'Fail quality inspection' }).matches(':disabled')).toBe(false);
  fireEvent(window, new Event('focus')); expect((await screen.findByLabelText('Check 1 name') as HTMLInputElement).value).toBe('Leak check');
});
it('denies another claimant and has a queue link when detail visibility is lost', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(claimed))); staff('QC', qcB);
  await screen.findByText('Record unavailable.'); expect(screen.getByRole('link', { name: /Return to quality desk/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record inspection checks' })).toBeNull();
});
it('retries uncertain QC decisions with the exact intent and returns to the desk after a confirmed result', async () => {
  let posts = 0;
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === 'POST' && ++posts === 1) throw new Error('lost'); return ok(claimed);
  }); vi.stubGlobal('fetch', fetcher); staff('QC');
  fireEvent.click(await screen.findByRole('button', { name: 'Record inspection checks' })); check('PASS');
  fireEvent.click(screen.getByRole('button', { name: 'Pass quality inspection' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/The result is uncertain/); expect(screen.getByRole('button', { name: 'Keep as is' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same request' })); await waitFor(() => expect(posts).toBe(2));
  const calls = fetcher.mock.calls.filter(([, options]) => options.method === 'POST'); expect(calls[0][1].body).toBe(calls[1][1].body);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/shops/${shopId}/qc`));
});
it('offers pickup only after READY_FOR_PICKUP and never allows a foreign customer to complete it', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok({ ...base, status: 'READY_FOR_PICKUP' })); vi.stubGlobal('fetch', fetcher);
  const view = customer(); await screen.findByRole('button', { name: 'Confirm vehicle pickup' });
  expect(screen.queryByRole('button', { name: 'Notify customer ready' })).toBeNull(); view.unmount();
  render(<BookingRecord id={id} customerId={qcA} returnTo="/customer" />); await screen.findByText('Record unavailable.');
  expect(screen.queryByRole('button', { name: 'Confirm vehicle pickup' })).toBeNull();
});
it('hides pickup and notice during repair, before QC pass, and in terminal states', async () => {
  for (const status of ['IN_REPAIR', 'QC_PENDING', 'QC_IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...base, status }))); const view = staff('SA');
    await screen.findByText('The work, recorded.');
    expect(screen.queryByRole('button', { name: 'Confirm vehicle pickup' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Notify customer ready' })).toBeNull(); view.unmount();
  }
});
