// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CustomerLedger, NotificationSummary } from '@/components/workspace/CustomerLedger';
import { BookingRecord } from '@/components/workspace/BookingRecord';
import { AuthForm } from '@/components/workspace/AuthForm';
import { authDestination, shopMembership } from '@/lib/workspace';
import { statusInfo } from '@/lib/booking/status';
import { bookingStatus } from '@/lib/contracts/bookings';
import { shopId, slotId } from './public-fixtures';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/auth/actions', () => ({ login: mocks.login, signup: mocks.signup }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
const customerId = 'b1100000-0000-4000-8000-000000000001';
const booking = { id: 'b1100000-0000-4000-8000-000000007001', customerId, shopId, slotId, vehicleId: customerId, status: 'PENDING', stateVersion: 0, symptomNotes: 'Brake noise', serviceIds: [], createdAt: '2026-10-10T10:00:00Z', technicianUserId: null, partsUserId: null, qcClaimedBy: null, completedAt: null };
function ok(data: unknown) { return new Response(JSON.stringify({ data, error: null }), { status: 200 }); }
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('normalizes unsafe auth destinations and preserves booking returns', () => {
  for (const value of [null, '//evil.test', '/auth/callback', '/login', '/login/', '/signup#fragment', '/signup?next=x', '/\\evil']) expect(authDestination(value)).toBe('/customer');
  expect(authDestination('/book/123?resume=1')).toBe('/book/123?resume=1');
});
it('has next-step guidance for every backend status', () => { expect(Object.keys(statusInfo)).toEqual(bookingStatus.options); });
it('membership lookup rejects inactive and foreign-user rows', () => {
  const identity = { user: { id: customerId, fullName: 'Customer', phone: null, email: null }, memberships: [{ id: customerId, userId: customerId, shopId, role: 'SA' as const, active: false }] };
  expect(shopMembership(identity, shopId)).toBeUndefined();
  identity.memberships[0].active = true;
  identity.memberships[0].userId = shopId;
  expect(shopMembership(identity, shopId)).toBeUndefined();
});
it('shows only own visits, separates terminal history and sorts newest first', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok([booking, { ...booking, id: customerId, symptomNotes: 'Older visit', createdAt: '2026-10-01T10:00:00Z' }, { ...booking, id: shopId, customerId: shopId, symptomNotes: 'Foreign concern' }, { ...booking, id: slotId, status: 'COMPLETED', symptomNotes: 'Completed repair' }])));
  render(<CustomerLedger customerId={customerId} />);
  await screen.findByText('Brake noise');
  expect(screen.queryByText('Foreign concern')).toBeNull();
  expect(screen.queryByText('Completed repair')).toBeNull();
  expect(screen.getAllByRole('heading', { level: 2 }).map(item => item.textContent)).toEqual(['Brake noise', 'Older visit']);
  fireEvent.click(screen.getByRole('button', { name: /Repair history/ }));
  expect(screen.getByText('Completed repair')).toBeTruthy();
});
it('handles empty, network failure and retry without leaking raw responses', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('private failure')).mockImplementation(async () => ok([]));
  vi.stubGlobal('fetch', fetcher);
  render(<CustomerLedger customerId={customerId} />);
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
  await screen.findByText('No visits in progress.');
  expect(screen.queryByText('private failure')).toBeNull();
});
it.each([401, 403, 404])('handles HTTP %i on booking reads', async status => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('private body', { status })));
  render(<BookingRecord id={booking.id} customerId={customerId} returnTo={`/customer/bookings/${booking.id}`} />);
  if (status === 401) expect((await screen.findByRole('link', { name: 'Sign in' })).getAttribute('href')).toContain(encodeURIComponent(`/customer/bookings/${booking.id}`));
  else await screen.findByText('Record unavailable.');
  expect(screen.queryByText('private body')).toBeNull();
});
it('does not render a foreign customer record even if a malformed API returns it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...booking, customerId: shopId, history: [] })));
  render(<BookingRecord id={booking.id} customerId={customerId} returnTo="/customer" />);
  await screen.findByText('Record unavailable.');
  expect(screen.queryByText('Brake noise')).toBeNull();
});
it('sorts API history chronologically, preserves notes and shows the actual estimate snapshot', async () => {
  const first = { id: customerId, actorUserId: customerId, fromStatus: null, toStatus: 'PENDING', action: 'CREATE_BOOKING', note: 'Customer request', createdAt: '2026-10-10T10:00:00Z' };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...booking, history: [{ ...first, id: shopId, toStatus: 'CONFIRMED', action: 'CONFIRM_BOOKING', createdAt: '2026-10-10T11:00:00Z' }, first], estimates: [{ id: slotId, bookingId: booking.id, shopId, revisionNo: 1, state: 'SENT', diagnosisNote: 'Brake pads worn', subtotalPkr: 1200, sentAt: null, decidedAt: null, createdAt: first.createdAt, items: [] }] })));
  render(<BookingRecord id={booking.id} customerId={customerId} returnTo="/customer" />);
  await screen.findAllByText('Customer request');
  expect(screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)).toEqual(['Awaiting confirmation', 'Visit confirmed']);
  expect(screen.getByText('Brake pads worn')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
});
it('renders unread summary from the existing API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ items: [], limit: 3, unreadCount: 0 })));
  render(<NotificationSummary />);
  await screen.findByText('0 unread');
  expect(fetch).toHaveBeenCalledWith('/api/v1/notifications?unread=true&limit=3', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
});
it('signs in through the existing action and preserves the return destination', async () => {
  mocks.login.mockResolvedValue({ data: { signedIn: true }, error: null });
  render(<AuthForm mode="login" next="/book/example?resume=1" />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/book/example?resume=1'));
  expect(mocks.login).toHaveBeenCalledWith({ email: 'user@example.test', password: 'example-password' });
});
it('waits for confirmation after signup rather than treating an unverified account as authenticated', async () => {
  mocks.signup.mockResolvedValue({ data: { requiresEmailConfirmation: true }, error: null });
  render(<AuthForm mode="signup" next="/customer" />);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Customer' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
  await screen.findByText('Check your inbox.');
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('uses verified memberships for default staff sign-in navigation', async () => {
  mocks.login.mockResolvedValue({ data: { signedIn: true }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ user: { id: customerId, fullName: 'Staff', phone: null, email: 'staff@example.test' }, memberships: [{ id: customerId, shopId, userId: customerId, role: 'PARTS', active: true }] })));
  render(<AuthForm mode="login" next="/customer" roleRedirect />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'staff@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(`/shops/${shopId}/parts`));
});
it('keeps sign-in errors retryable and never navigates an unsuccessful session', async () => {
  mocks.login.mockRejectedValueOnce(new Error('private internal error'));
  render(<AuthForm mode="login" next="/customer" />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('Check your connection');
  expect(mocks.replace).not.toHaveBeenCalled();
});
