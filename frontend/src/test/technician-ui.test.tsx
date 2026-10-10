// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';
import { StaffQueue } from '@/components/workspace/StaffQueue';
import { bookingDetailOutput } from '@/lib/contracts/booking-actions';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const shopId = 'b1100000-0000-4000-8000-000000001001';
const id = 'b1100000-0000-4000-8000-000000000101';
const tech = 'b1100000-0000-4000-8000-000000000004';
const partId = 'b1100000-0000-4000-8000-000000003001';
const base = bookingDetailOutput.parse({ id, shopId, customerId: partId, vehicleId: partId, slotId: partId,
  status: 'INSPECTING', stateVersion: 3, symptomNotes: 'Brake pedal is soft', serviceIds: [], createdAt: '2026-10-10T10:00:00Z',
  technicianUserId: tech, partsUserId: null, qcClaimedBy: null, completedAt: null, history: [],
  vehicle: { registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileageKm: 50000 },
  customer: { fullName: 'Customer fixture', phone: null } });
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
const catalog = { items: [{ id: partId, sku: 'ZERO-STOCK-BELT', name: 'Drive belt' }], page: 1, pageSize: 50, total: 1 };
function record(role: 'TECHNICIAN' | 'SA' | 'QC' = 'TECHNICIAN') {
  return render(<StaffBookingRecord id={id} shopId={shopId} role={role} actorId={tech} returnTo={`/shops/${shopId}/bookings/${id}`} />);
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('lists only assigned jobs using mine and rejects unexpected assignee or shop responses', async () => {
  const fetcher = vi.fn().mockResolvedValue(ok({ items: [base], page: 1, pageSize: 50 })); vi.stubGlobal('fetch', fetcher);
  const view = render(<StaffQueue shopId={shopId} role="TECHNICIAN" actorId={tech} />);
  await screen.findByRole('link', { name: 'Brake pedal is soft' });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('assignee=mine'), expect.anything());
  view.unmount();
  fetcher.mockResolvedValue(ok({ items: [{ ...base, technicianUserId: partId }], page: 1, pageSize: 50 }));
  render(<StaffQueue shopId={shopId} role="TECHNICIAN" actorId={tech} />);
  await screen.findByRole('button', { name: /Try again/ });
  expect(screen.queryByRole('link', { name: 'Brake pedal is soft' })).toBeNull();
});
it('shows actual vehicle/customer context and starts inspection through a confirmed action', async () => {
  let current = { ...base, status: 'ASSIGNED' as const, stateVersion: 2 };
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === 'POST') current = { ...current, status: 'INSPECTING' as typeof current.status, stateVersion: 3 };
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher); record();
  await screen.findByText('Honda Civic · 2016');
  expect(screen.getByText('Customer fixture')).toBeTruthy();
  expect(screen.getByText(/LEA-1234/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start inspection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByLabelText('Diagnosis notes');
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string))
    .toMatchObject({ action: 'START_INSPECTION', expectedVersion: 2, payload: {} });
  expect(screen.queryByRole('button', { name: /Approve|Claim QC|Pass QC/ })).toBeNull();
});
it('selects real catalog identity including zero-stock choices, submits itemized data and shows saved server totals across reload', async () => {
  let current = base;
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.includes('estimate-catalog')) return ok(catalog);
    if (options.method === 'POST') {
      const input = JSON.parse(options.body as string);
      current = { ...base, status: 'ESTIMATE_REVIEW', stateVersion: 4, estimates: [{ id: partId, bookingId: id, shopId, revisionNo: 1,
        state: 'REVIEW', diagnosisNote: input.payload.diagnosisNote, subtotalPkr: 13900, sentAt: null, decidedAt: null, createdAt: base.createdAt,
        items: input.payload.items.map((item: { quantity: number; unitPricePkr: number }, index: number) => ({ ...item,
          id: index === 0 ? id : partId, lineTotalPkr: item.quantity * item.unitPricePkr })) }] };
    }
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher); const view = record();
  fireEvent.change(await screen.findByLabelText('Diagnosis notes'), { target: { value: 'Drive belt requires replacement' } });
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Fit replacement belt' } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price (PKR)'), { target: { value: '900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select part for item 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Select Drive belt' }));
  fireEvent.change(screen.getByLabelText('Item 2 quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Item 2 unit price (PKR)'), { target: { value: '6500' } });
  expect(screen.getByText('PKR 13,900')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Submit estimate for review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('region', { name: 'Saved itemized estimates' });
  const payload = JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string);
  expect(payload).toMatchObject({ action: 'SUBMIT_ESTIMATE', expectedVersion: 3, payload: { diagnosisNote: 'Drive belt requires replacement',
    items: [{ kind: 'LABOUR', partId: null, quantity: 1, unitPricePkr: 900 }, { kind: 'PART', partId, quantity: 2, unitPricePkr: 6500 }] } });
  expect(payload.payload).not.toHaveProperty('subtotalPkr');
  expect(payload.payload.items[0]).not.toHaveProperty('lineTotalPkr');
  expect(await screen.findByText('Recorded server total')).toBeTruthy();
  expect(screen.queryByLabelText('Diagnosis notes')).toBeNull();
  view.unmount(); record();
  await screen.findByRole('region', { name: 'Saved itemized estimates' });
});
it('validates whole-PKR entries and catalog selection before any mutation and preserves draft through focus refresh', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok(base)); vi.stubGlobal('fetch', fetcher); record();
  fireEvent.change(await screen.findByLabelText('Diagnosis notes'), { target: { value: 'Inspected brakes' } });
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Labour' } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price (PKR)'), { target: { value: '9.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit estimate for review' }));
  expect(screen.getByRole('alert').textContent).toContain('whole');
  expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText('Item 1 unit price (PKR)'), { target: { value: '900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
  fireEvent.change(screen.getByLabelText('Item 2 unit price (PKR)'), { target: { value: '6500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit estimate for review' }));
  expect(screen.getByRole('alert').textContent).toContain('Select a workshop catalog part');
  fireEvent(window, new Event('focus'));
  expect((await screen.findByLabelText('Diagnosis notes') as HTMLTextAreaElement).value).toBe('Inspected brakes');
  expect((screen.getByLabelText('Item 1 unit price (PKR)') as HTMLInputElement).value).toBe('900');
});
it('shows QC failure, requires repair notes and resubmits with the existing action then displays resolved feedback', async () => {
  const issue = { id: partId, bookingId: id, shopId, qcRunId: partId, reportedBy: partId, title: 'Leak remains',
    description: 'Fluid leak after road test', createdAt: base.createdAt, updatedAt: base.createdAt, resolvedAt: null };
  let current = { ...base, status: 'IN_REPAIR' as const, stateVersion: 9, qcIssues: [issue] };
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === 'POST') current = { ...current, status: 'QC_PENDING' as typeof current.status, stateVersion: 10,
      qcIssues: [{ ...issue, resolvedAt: base.createdAt as unknown as null }] };
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher); record();
  await screen.findByText('Leak remains');
  expect(screen.getByText('Fluid leak after road test')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Resubmit repair for QC' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Repair notes'), { target: { value: '  Replaced seal and checked for leaks  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resubmit repair for QC' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Resolved on resubmission');
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string))
    .toMatchObject({ action: 'COMPLETE_REPAIR', expectedVersion: 9, payload: { notes: 'Replaced seal and checked for leaks' } });
  expect(screen.queryByLabelText('Repair notes')).toBeNull();
});
it('denies other technicians at detail and hides tech controls from other roles', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...base, technicianUserId: partId })));
  const view = record(); await screen.findByText('Record unavailable.');
  expect(screen.queryByText('Customer fixture')).toBeNull();
  expect(screen.queryByLabelText('Diagnosis notes')).toBeNull(); view.unmount();
  record('QC'); await screen.findByText('Record unavailable.');
  expect(screen.queryByLabelText('Diagnosis notes')).toBeNull();
  expect(screen.queryByRole('button', { name: /Complete repair/ })).toBeNull();
});
it('handles catalog network errors, retry, paging and empty catalogs without invented parts', async () => {
  let attempts = 0;
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    if (!url.includes('estimate-catalog')) return ok(base);
    if (++attempts === 1) throw new Error('Network');
    if (url.includes('page=2')) return ok({ items: [], page: 2, pageSize: 50, total: 51 });
    return ok({ ...catalog, total: 51 });
  }); vi.stubGlobal('fetch', fetcher); record();
  await screen.findByLabelText('Diagnosis notes'); fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select part for item 2' }));
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
  await screen.findByRole('button', { name: 'Select Drive belt' });
  fireEvent.click(screen.getByRole('button', { name: 'Next parts' }));
  await screen.findByText('No catalog items');
  expect(screen.queryByRole('button', { name: 'Select Drive belt' })).toBeNull();
});
