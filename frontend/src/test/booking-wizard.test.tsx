// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { emptyBookingForm, writeDraft, readDraft, type SavedDraft } from '@/lib/booking/draft';
import { calendarDates } from '@/lib/format';
import { fixtureShop, shopId, slotId, serviceId } from './public-fixtures';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), login: vi.fn(), signup: vi.fn(), logout: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/auth/actions', () => ({ login: mocks.login, signup: mocks.signup, logout: mocks.logout }));
const actorId = 'b1100000-0000-4000-8000-000000009001';
const bookingId = 'b1100000-0000-4000-8000-000000009002';
const identity = { user: { id: actorId, fullName: 'Test Customer', phone: null, email: 'customer@example.test' }, memberships: [] };
const date = calendarDates('Asia/Karachi')[1];
const slot = { id: slotId, shopId, startsAt: `${date}T04:00:00Z`, endsAt: `${date}T05:00:00Z`, capacity: 1, capacityRemaining: 1 };
const created = { id: bookingId, shopId, customerId: actorId, vehicleId: actorId, slotId, status: 'PENDING', stateVersion: 0, symptomNotes: '', serviceIds: [serviceId], createdAt: new Date().toISOString() };
const detail = { ...created, technicianUserId: null, partsUserId: null, qcClaimedBy: null, completedAt: null, history: [] };
const fields = { ...emptyBookingForm, serviceIds: [serviceId], date, slotId, registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: '2016' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data, error: null }), { status });
function saveReview() {
  const draft: SavedDraft = { version: 1, shopId, values: fields, step: 4, savedAt: Date.now(), pending: null, receipt: null };
  writeDraft(window.localStorage, draft);
}
function api(options: { signedIn?: boolean; post?: (input: RequestInit) => Promise<Response>; slots?: typeof slot[]; identity?: typeof identity } = {}) {
  let signedIn = options.signedIn ?? true;
  mocks.login.mockImplementation(async () => { signedIn = true; return { data: { signedIn: true }, error: null }; });
  const fetcher = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me') return signedIn ? json(options.identity ?? identity) : new Response(null, { status: 401 });
    if (url.includes('/slots?date=')) return json(options.slots ?? [slot]);
    if (url === '/api/v1/bookings' && init?.method === 'POST') return options.post ? options.post(init) : json(created, 201);
    if (url === `/api/v1/bookings/${bookingId}`) return json(detail);
    throw new Error(`Unexpected test URL: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(() => { window.localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const continueButton = () => screen.getByRole('button', { name: /^Continue/ });
const postCalls = (fetcher: ReturnType<typeof api>) => fetcher.mock.calls.filter(([url, init]) => url === '/api/v1/bookings' && init.method === 'POST');

it('completes all five steps for a known service and renders only the authoritative booking confirmation', async () => {
  const fetcher = api(); const user = userEvent.setup();
  render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('heading', { name: 'What brings you in?' });
  await user.click(screen.getByRole('checkbox', { name: /Brake inspection/ }));
  await user.click(continueButton());
  await user.selectOptions(screen.getByLabelText(/Appointment date/), date);
  await user.click(await screen.findByRole('button', { name: /9:00 am.*available/i }));
  await user.click(continueButton());
  await user.type(screen.getByLabelText(/Registration plate/), 'lea-1234');
  await user.type(screen.getByLabelText('Make *'), 'Honda');
  await user.type(screen.getByLabelText('Model *'), 'Civic');
  await user.type(screen.getByLabelText('Year *'), '2016');
  await user.click(continueButton());
  await screen.findByText('Signed in');
  await user.click(continueButton());
  expect(screen.getByRole('heading', { name: 'One last look. Then you’re set.' })).toBeTruthy();
  expect(postCalls(fetcher)).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('heading', { name: 'Your visit is on the ledger.' });
  const body = JSON.parse(postCalls(fetcher)[0][1].body);
  expect(body).toMatchObject({ shopId, slotId, serviceIds: [serviceId], vehicle: { registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileageKm: null } });
  expect(body).not.toHaveProperty('customerId');
  expect(mocks.replace).toHaveBeenCalledWith(`/book/${shopId}?booking=${bookingId}`);
  expect(readDraft(window.localStorage, shopId)?.receipt?.id).toBe(bookingId);
});

it('validates empty symptoms and vehicle fields without posting, and focuses an invalid vehicle field', async () => {
  const fetcher = api(); const user = userEvent.setup();
  render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('heading', { name: 'What brings you in?' });
  await user.click(continueButton());
  expect(screen.getByRole('alert').textContent).toContain('at least 10 characters');
  await user.click(screen.getByRole('checkbox', { name: /Not sure what needs fixing/ }));
  await user.type(screen.getByLabelText(/What are you noticing/), 'Engine stalls while idling.');
  await user.click(continueButton());
  await user.selectOptions(screen.getByLabelText(/Appointment date/), date);
  await user.click(await screen.findByRole('button', { name: /9:00 am.*available/i }));
  await user.click(continueButton()); await user.click(continueButton());
  expect(screen.getByRole('alert').textContent).toContain('highlighted vehicle details');
  expect(document.activeElement?.id).toBe('vehicle-registrationPlate');
  expect(postCalls(fetcher)).toHaveLength(0);
});

it('authenticates inline for a symptom-only draft and preserves the draft without saving passwords', async () => {
  const fetcher = api({ signedIn: false });
  writeDraft(window.localStorage, { version: 1, shopId, savedAt: Date.now(), values: { ...fields, serviceIds: [], symptomNotes: 'Engine stalls while idling.', notSure: true }, pending: null, receipt: null, step: 3 });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('button', { name: /Sign in & continue/ });
  expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText(/Email address/), 'customer@example.test');
  await user.type(screen.getByLabelText(/Password/), 'Test-Password-123!');
  await user.click(screen.getByRole('button', { name: /Sign in & continue/ }));
  await screen.findByText('Signed in');
  expect(window.localStorage.getItem(`bayflow:booking:v1:${shopId}`)).not.toContain('Test-Password');
  expect(postCalls(fetcher)).toHaveLength(0);
  await user.click(continueButton());
  await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('heading', { name: 'Your visit is on the ledger.' });
  expect(JSON.parse(postCalls(fetcher)[0][1].body)).toMatchObject({ serviceIds: [], symptomNotes: 'Engine stalls while idling.' });
});

it('persists changes across a reload and restores the current step and selected service', async () => {
  api(); const user = userEvent.setup();
  const first = render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('heading', { name: 'What brings you in?' });
  await user.click(screen.getByRole('checkbox', { name: /Brake inspection/ }));
  await user.type(screen.getByLabelText(/What are you noticing/), 'Brake pedal feels soft.');
  await user.click(continueButton());
  await waitFor(() => expect(readDraft(window.localStorage, shopId)?.step).toBe(1));
  first.unmount(); render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('heading', { name: 'A time that works for you.' });
  expect(readDraft(window.localStorage, shopId)?.values).toMatchObject({ serviceIds: [serviceId], symptomNotes: 'Brake pedal feels soft.' });
});

it('locks and reuses the exact request after a lost response, including across a reload', async () => {
  saveReview();
  let attempts = 0;
  const remainingSlots = [{ ...slot }];
  const fetcher = api({ slots: remainingSlots, post: async () => { attempts++; if (attempts === 1) throw new TypeError('lost response'); return json(created, 200); } });
  const user = userEvent.setup(); const first = render(<BookingWizard shop={fixtureShop} />);
  await screen.findByRole('heading', { name: 'One last look. Then you’re set.' });
  await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('button', { name: /Safely retry this booking/ });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not verify the result'));
  expect((screen.getByRole('button', { name: 'Edit the concern' }) as HTMLButtonElement).disabled).toBe(true);
  const pending = readDraft(window.localStorage, shopId)?.pending;
  expect(pending?.actorId).toBe(actorId);
  const firstBody = postCalls(fetcher)[0][1].body;
  remainingSlots[0].capacityRemaining = 0;
  first.unmount(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Safely retry this booking/ }));
  await screen.findByRole('heading', { name: 'Your visit is on the ledger.' });
  expect(postCalls(fetcher)).toHaveLength(2);
  expect(postCalls(fetcher)[1][1].body).toBe(firstBody);
});

it('handles a server slot conflict by returning to live appointments and clearing the stale intent', async () => {
  saveReview(); const fetcher = api({ post: async () => new Response(JSON.stringify({ data: null, error: { code: 'SLOT_CONFLICT', message: 'private' } }), { status: 409 }) });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('heading', { name: 'A time that works for you.' });
  expect(screen.getByRole('alert').textContent).toContain('choose another time');
  expect(screen.getByRole('alert').textContent).not.toContain('private');
  expect(readDraft(window.localStorage, shopId)?.pending).toBeNull();
  expect(postCalls(fetcher)).toHaveLength(1);
});

it('prevents double submission while a booking request is in flight', async () => {
  saveReview(); let resolve!: (value: Response) => void;
  const fetcher = api({ post: () => new Promise<Response>(done => { resolve = done; }) });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.dblClick(await screen.findByRole('button', { name: /Confirm booking/ }));
  await waitFor(() => expect(postCalls(fetcher)).toHaveLength(1));
  expect((screen.getByRole('button', { name: /Confirming your visit/ }) as HTMLButtonElement).disabled).toBe(true);
  resolve(json(created, 201));
  await screen.findByRole('heading', { name: 'Your visit is on the ledger.' });
  expect(postCalls(fetcher)).toHaveLength(1);
});

it('requires durable request-key storage before a mutation and preserves the draft on failure', async () => {
  saveReview(); const fetcher = api();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded'); });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Confirm booking/ }));
  await screen.findByText(/Allow site storage before confirming/);
  expect(postCalls(fetcher)).toHaveLength(0);
});

it('does not replay an uncertain request under a different authenticated actor', async () => {
  saveReview(); const first = readDraft(window.localStorage, shopId)!;
  writeDraft(window.localStorage, { ...first, pending: { actorId: bookingId, payload: { shopId, slotId, serviceIds: [serviceId], symptomNotes: '', vehicle: { registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileageKm: null }, idempotencyKey: bookingId } } });
  const fetcher = api(); const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Safely retry this booking/ }));
  await screen.findByText(/pending request belongs to a different account/);
  expect(postCalls(fetcher)).toHaveLength(0);
});

it('revalidates appointment capacity before posting and returns to the calendar when the slot is full', async () => {
  saveReview(); const fetcher = api({ slots: [{ ...slot, capacityRemaining: 0 }] });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('heading', { name: 'A time that works for you.' });
  expect(postCalls(fetcher)).toHaveLength(0);
  const full = await screen.findByRole('button', { name: /Fully booked/ });
  expect((full as HTMLButtonElement).disabled).toBe(true);
});

it('loads a service selected from a later profile catalog page without losing the chosen service ID', async () => {
  const secondServiceId = 'b1100000-0000-4000-8000-000000003002';
  const shop = { ...fixtureShop, services: { ...fixtureShop.services, total: 51 } };
  const fetcher = api();
  fetcher.mockImplementation(async (url: string) => {
    if (url === '/api/v1/me') return json(identity);
    if (url.includes('/services?page=2')) return json({ items: [{ ...fixtureShop.services.items[0], id: secondServiceId, name: 'Oil inspection' }], page: 2, pageSize: 50, total: 51 });
    throw new Error('Unexpected test URL');
  });
  render(<BookingWizard shop={shop} hints={{ service: secondServiceId }} />);
  const selected = await screen.findByRole('checkbox', { name: /Oil inspection/ });
  expect((selected as HTMLInputElement).checked).toBe(true);
});

it('does not send a booking mutation if a saved review is reopened signed out', async () => {
  saveReview(); const fetcher = api({ signedIn: false });
  const user = userEvent.setup(); render(<BookingWizard shop={fixtureShop} />);
  await user.click(await screen.findByRole('button', { name: /Confirm booking/ }));
  await screen.findByRole('heading', { name: 'Keep your visit connected.' });
  expect(postCalls(fetcher)).toHaveLength(0);
});
