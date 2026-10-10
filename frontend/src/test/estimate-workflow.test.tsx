// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BookingRecord } from '@/components/workspace/BookingRecord';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';
import { AdvisorEstimateReview } from '@/components/estimates/AdvisorEstimateReview';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { estimateShop as shopId, estimateBooking as id, estimateCustomer as customerId, estimatePart as partId,
  estimateTime as time, secondEstimateId, reviewBooking, sentBooking, sentEstimate } from './estimate-fixtures';
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
const failure = (status: number, code: string) => new Response(JSON.stringify({ data: null, error: { code, message: 'PRIVATE' } }), { status });
const customer = (actor = customerId) => render(<BookingRecord id={id} customerId={actor} returnTo={`/customer/bookings/${id}`} />);
const advisor = () => render(<StaffBookingRecord id={id} shopId={shopId} role="SA" actorId={partId} returnTo={`/shops/${shopId}/bookings/${id}`} />);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('completes send → reject → revision → resend → approve, preserving snapshots, timestamps and reload state', async () => {
  let current: JobRecord = reviewBooking;
  const actions: string[] = [];
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method !== 'POST') return ok(current);
    const input = JSON.parse(options.body as string);
    expect(input.expectedVersion).toBe(current.stateVersion);
    expect(input).not.toHaveProperty('customerId'); expect(input.payload).not.toHaveProperty('subtotalPkr');
    actions.push(input.action);
    const latest = [...current.estimates].sort((a, b) => b.revisionNo - a.revisionNo)[0];
    if (input.action === 'SEND_ESTIMATE' || input.action === 'REVISE_ESTIMATE') {
      const items = input.payload.items.map((item: { quantity: number; unitPricePkr: number }, index: number) => ({ ...item,
        id: index === 0 ? partId : secondEstimateId, lineTotalPkr: item.quantity * item.unitPricePkr }));
      const next = { ...latest, diagnosisNote: input.payload.diagnosisNote, items,
        subtotalPkr: items.reduce((total: number, item: { lineTotalPkr: number }) => total + item.lineTotalPkr, 0),
        ...(input.action === 'REVISE_ESTIMATE' ? { id: secondEstimateId, revisionNo: latest.revisionNo + 1, state: 'REVIEW' as const, sentAt: null, decidedAt: null }
          : { state: 'SENT' as const, sentAt: time }),
      };
      current = { ...current, status: input.action === 'SEND_ESTIMATE' ? 'AWAITING_CUSTOMER' : 'ESTIMATE_REVIEW',
        estimates: input.action === 'REVISE_ESTIMATE' ? [...current.estimates, next] : current.estimates.map(item => item.id === latest.id ? next : item) };
    } else {
      const approved = input.action === 'APPROVE_ESTIMATE';
      current = { ...current, status: approved ? 'ESTIMATE_APPROVED' : 'ESTIMATE_REJECTED', estimates: current.estimates.map(item =>
        item.id === latest.id ? { ...item, state: approved ? 'APPROVED' : 'REJECTED', decidedAt: time } : item) };
    }
    current = { ...current, stateVersion: current.stateVersion + 1, history: [...current.history, { id: crypto.randomUUID(),
      actorUserId: customerId, fromStatus: null, toStatus: current.status, action: input.action, note: input.payload.reason ?? null, createdAt: time }] };
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher);
  let view = advisor();
  fireEvent.click(await screen.findByRole('button', { name: 'Review and edit estimate' }));
  fireEvent.change(screen.getByLabelText('Review item 2 unit price (PKR)'), { target: { value: '1200' } });
  expect(screen.getAllByText('PKR 7,700').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Send estimate to customer' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('heading', { name: 'Your decision needed', level: 2 }); view.unmount();
  view = customer();
  fireEvent.click(await screen.findByText('Decline this estimate'));
  fireEvent.change(screen.getByLabelText('Reason for declining (optional)'), { target: { value: '  Please review labour price  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Decline estimate' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Please review labour price');
  const declined = structuredClone(current.estimates[0]); view.unmount();
  view = advisor();
  fireEvent.click(await screen.findByRole('button', { name: 'Review and edit estimate' }));
  fireEvent.change(screen.getByLabelText('Review item 2 unit price (PKR)'), { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create revised estimate' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Advisor estimate review' }).textContent).toContain('Revision 2'));
  expect(current.estimates[0]).toEqual(declined);
  fireEvent.click(screen.getByRole('button', { name: 'Review and edit estimate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send estimate to customer' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('heading', { name: 'Your decision needed', level: 2 }); view.unmount();
  view = customer();
  fireEvent.click(await screen.findByRole('button', { name: 'Approve estimate · PKR 7,100' }));
  expect(screen.getByRole('dialog').textContent).toContain('revision 2');
  expect(screen.getByRole('dialog').textContent).toContain('permission to repair');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Approved · PKT');
  expect(current.estimates[0]).toEqual(declined);
  expect(actions).toEqual(['SEND_ESTIMATE', 'REJECT_ESTIMATE', 'REVISE_ESTIMATE', 'SEND_ESTIMATE', 'APPROVE_ESTIMATE']);
  view.unmount(); customer();
  await screen.findByText('Approved · PKT');
  expect(screen.queryByRole('button', { name: /Approve estimate/ })).toBeNull();
  fireEvent.click(screen.getByText('Previous revision 1 · REJECTED'));
  expect(screen.getByText('Declined · PKT')).toBeTruthy();
});
it('shows exact sent parts/labour amounts and timestamps, and allows declining with no reason', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok(sentBooking)); vi.stubGlobal('fetch', fetcher); customer();
  await screen.findByRole('button', { name: /Approve estimate/ });
  const snapshot = screen.getByRole('article', { name: 'Recorded estimate revision 1' });
  expect(within(snapshot).getByText('Drive belt')).toBeTruthy(); expect(within(snapshot).getByText('Fit belt')).toBeTruthy();
  expect(within(snapshot).getByText('Sent · PKT')).toBeTruthy();
  fireEvent.click(screen.getByText('Decline this estimate')); fireEvent.click(screen.getByRole('button', { name: 'Decline estimate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true));
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string)).toMatchObject({ action: 'REJECT_ESTIMATE', expectedVersion: 5, payload: {} });
});
it('locks duplicate decision submissions and never advances status from local state', async () => {
  let finish: (response: Response) => void = () => {};
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST'
    ? new Promise<Response>(resolve => { finish = resolve; }) : ok(sentBooking));
  vi.stubGlobal('fetch', fetcher); customer();
  fireEvent.click(await screen.findByRole('button', { name: /Approve estimate/ }));
  const confirm = screen.getByRole('button', { name: 'Confirm change' }); fireEvent.click(confirm); fireEvent.click(confirm);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('Approved · PKT')).toBeNull();
  finish(ok({ ...sentBooking, status: 'ESTIMATE_APPROVED' }));
  // The follow-up GET still says SENT: the UI must follow that authoritative read.
  await screen.findByRole('button', { name: /Approve estimate/ });
  expect(screen.queryByText('Approved · PKT')).toBeNull();
});
it.each([[409, 'STATE_CONFLICT'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [422, 'ACTION_NOT_ALLOWED']])
  ('handles customer decision %i %s with safe guidance and authoritative reload', async (status, code) => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST' ? failure(status, code) : ok(sentBooking));
    vi.stubGlobal('fetch', fetcher); customer(); fireEvent.click(await screen.findByRole('button', { name: /Approve estimate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload record' }));
    await screen.findByRole('button', { name: /Approve estimate/ });
    expect(fetcher.mock.calls.filter(([, options]) => options.method !== 'POST').length).toBeGreaterThan(1);
    expect(screen.queryByText('PRIVATE')).toBeNull();
  });
it('retains identical decision payload/version/key after uncertain responses and blocks cancellation', async () => {
  let attempts = 0;
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === 'POST' && ++attempts === 1) throw new Error('lost response');
    return ok(sentBooking);
  }); vi.stubGlobal('fetch', fetcher); customer();
  fireEvent.click(await screen.findByRole('button', { name: /Approve estimate/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/The result is uncertain/);
  expect(screen.getByRole('button', { name: 'Keep as is' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
  await waitFor(() => expect(attempts).toBe(2));
  const posts = fetcher.mock.calls.filter(([, options]) => options.method === 'POST'); expect(posts[0][1].body).toBe(posts[1][1].body);
});
it('retains advisor edits on refresh, blocks a stale draft, and resets explicitly to the server source', async () => {
  let current = reviewBooking;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(current))); advisor();
  fireEvent.click(await screen.findByRole('button', { name: 'Review and edit estimate' }));
  fireEvent.change(screen.getByLabelText('Review item 2 unit price (PKR)'), { target: { value: '1200' } });
  fireEvent(window, new Event('focus'));
  expect((await screen.findByLabelText('Review item 2 unit price (PKR)') as HTMLInputElement).value).toBe('1200');
  current = { ...reviewBooking, stateVersion: 5 }; fireEvent(window, new Event('focus'));
  await screen.findByText(/The server record changed/);
  expect(screen.getByRole('button', { name: 'Send estimate to customer' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reset to server revision' }));
  expect((screen.getByLabelText('Review item 2 unit price (PKR)') as HTMLInputElement).value).toBe('900');
});
it('validates advisor prices and added labour and preserves the source part identity', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok(reviewBooking)); vi.stubGlobal('fetch', fetcher); advisor();
  fireEvent.click(await screen.findByRole('button', { name: 'Review and edit estimate' }));
  fireEvent.change(screen.getByLabelText('Review item 2 unit price (PKR)'), { target: { value: '9.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send estimate to customer' }));
  expect(screen.getByRole('alert').textContent).toContain('whole PKR');
  expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText('Review item 2 unit price (PKR)'), { target: { value: '900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add labour item' }));
  fireEvent.change(screen.getByLabelText('Review item 3 description'), { target: { value: 'Road test' } });
  fireEvent.change(screen.getByLabelText('Review item 3 unit price (PKR)'), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send estimate to customer' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true));
  const input = JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string);
  expect(input.payload.items[0].partId).toBe(partId);
  expect(input.payload.items[2]).toMatchObject({ kind: 'LABOUR', partId: null, unitPricePkr: 500 });
});
it('hides review controls from technicians and customer decisions on unrelated or unpublished snapshots', async () => {
  const props = { booking: reviewBooking, bookingId: id, shopId, returnTo: '/workshop', refresh: vi.fn() };
  const view = render(<AdvisorEstimateReview {...props} role="TECHNICIAN" />);
  expect(screen.queryByRole('button', { name: 'Review and edit estimate' })).toBeNull(); view.unmount();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(sentBooking))); const foreign = customer(partId);
  await screen.findByText('Record unavailable.'); expect(screen.queryByRole('button', { name: /Approve estimate/ })).toBeNull(); foreign.unmount();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...sentBooking, estimates: [sentEstimate, { ...sentEstimate, id: secondEstimateId, revisionNo: 2, state: 'REVIEW', diagnosisNote: 'Private unsent diagnosis' }] })));
  customer(); await screen.findByText('Belt worn after inspection');
  expect(screen.queryByText('Private unsent diagnosis')).toBeNull(); expect(screen.queryByRole('button', { name: /Approve estimate/ })).toBeNull();
});
it('supports conservative modal cancellation and rejects a mismatched snapshot before rendering', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(sentBooking))); const view = customer();
  fireEvent.click(await screen.findByRole('button', { name: /Approve estimate/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep as is' })); expect(screen.queryByRole('dialog')).toBeNull(); view.unmount();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...sentBooking, estimates: [{ ...sentEstimate, shopId: partId }] })));
  customer(); await screen.findByText('Record unavailable.'); expect(screen.queryByText('Drive belt')).toBeNull();
});
