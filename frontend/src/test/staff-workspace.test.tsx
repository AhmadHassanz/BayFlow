// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StaffShell } from '@/components/workspace/StaffShell';
import { WorkspaceChoice } from '@/components/workspace/WorkspaceChoice';
import { StaffQueue } from '@/components/workspace/StaffQueue';
import { BookingRecord } from '@/components/workspace/BookingRecord';
import { shopId, slotId } from './public-fixtures';
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => `/shops/${shopId}/advisor`, useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/auth/actions', () => ({ logout: vi.fn() }));
const userId = 'b1100000-0000-4000-8000-000000000001';
const membership = { id: userId, shopId, userId, role: 'SA' as const, active: true };
const identity = { user: { id: userId, fullName: 'Advisor', email: null, phone: null }, memberships: [membership] };
const shop = { id: shopId, name: 'Workshop', city: 'Lahore', timezone: 'Asia/Karachi' };
const booking = { id: slotId, customerId: userId, shopId, slotId, vehicleId: userId, status: 'PENDING', stateVersion: 0, symptomNotes: 'Brake concern', serviceIds: [], createdAt: '2026-10-10T10:00:00Z', technicianUserId: null, partsUserId: null, qcClaimedBy: null, completedAt: null };
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('advisor nav contains only implemented authorized routes and mobile menu has Escape dismissal', () => {
  render(<StaffShell identity={identity} membership={membership} shop={shop} shops={[shop]}><p>Workspace body</p></StaffShell>);
  expect(screen.queryByRole('link', { name: /Your workshops/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /Settings|Technician|Parts|Quality control/ })).toBeNull();
  const button = screen.getByRole('button', { name: 'Menu' });
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(button);
});
it('keeps keyboard focus in the open mobile navigation and its toggle', () => {
  render(<StaffShell identity={identity} membership={membership} shop={shop} shops={[shop]}><a href="/unrelated">Body link</a></StaffShell>);
  const button = screen.getByRole('button', { name: 'Menu' });
  button.focus(); fireEvent.click(button);
  fireEvent.keyDown(button, { key: 'Tab' });
  expect(document.activeElement?.getAttribute('href')).toBe('/');
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(button);
});
it('switches only to an active verified membership with the correct role route', () => {
  const second = { ...membership, id: slotId, shopId: userId, role: 'TECHNICIAN' as const };
  render(<StaffShell identity={{ ...identity, memberships: [membership, second, { ...second, id: shopId, active: false }] }} membership={membership} shop={shop} shops={[shop, { ...shop, id: userId, name: 'Second Workshop' }]}><p>Body</p></StaffShell>);
  expect(screen.getAllByRole('option')).toHaveLength(2);
  expect(screen.getByRole('link', { name: /All workspaces/ }).getAttribute('href')).toBe('/workspace');
  fireEvent.change(screen.getByLabelText('Shop & role'), { target: { value: slotId } });
  expect(mocks.push).toHaveBeenCalledWith(`/shops/${userId}/technician`);
});
it('owner receives the workshop switcher link', () => {
  const owner = { ...membership, role: 'OWNER' as const };
  render(<StaffShell identity={{ ...identity, memberships: [owner] }} membership={owner} shop={shop} shops={[shop]}><p>Body</p></StaffShell>);
  expect(screen.getByRole('link', { name: /Your workshops/ }).getAttribute('href')).toBe('/owner');
});
it('renders explicit verified shop and role choices for a multi-membership identity', () => {
  const second = { ...membership, id: slotId, shopId: userId, role: 'TECHNICIAN' as const };
  render(<WorkspaceChoice memberships={[membership, second]} shops={[shop, { ...shop, id: userId, name: 'Second Workshop' }]} />);
  expect(screen.getByRole('link', { name: /Open service advisor workspace/ }).getAttribute('href')).toBe(`/shops/${shopId}/advisor`);
  expect(screen.getByRole('link', { name: /Open technician workspace/ }).getAttribute('href')).toBe(`/shops/${userId}/technician`);
  expect(screen.getByRole('link', { name: /personal ledger/ }).getAttribute('href')).toBe('/customer');
});
it('reads the existing role-scoped API and links to the shared record', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ items: [booking], page: 1, pageSize: 50 })));
  render(<StaffQueue shopId={shopId} role="SA" />);
  expect((await screen.findByRole('link', { name: 'Brake concern' })).getAttribute('href')).toBe(`/shops/${shopId}/bookings/${slotId}`);
  expect(fetch).toHaveBeenCalledWith(`/api/v1/shops/${shopId}/bookings?page=1&assignee=all`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
  expect(screen.getByRole('button', { name: /Next/ }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: /Confirm booking/ })).toBeNull();
});
it('handles a revoked membership without exposing a failed response body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('private failure', { status: 403 })));
  render(<StaffQueue shopId={shopId} role="SA" />);
  await screen.findByText('Record unavailable.');
  expect(screen.queryByText('private failure')).toBeNull();
});
it('handles queue network errors, retry and empty responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network')).mockImplementation(async () => ok({ items: [], page: 1, pageSize: 50 })));
  render(<StaffQueue shopId={shopId} role="TECHNICIAN" />);
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
  await screen.findByText('A clear workbench.');
});
it('paginates a full API page without inventing a total count', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => ok({ items: url.includes('page=2') ? [] : Array.from({ length: 50 }, (_, index) => ({ ...booking, id: `b1100000-0000-4000-8000-${String(index).padStart(12, '0')}` })), page: url.includes('page=2') ? 2 : 1, pageSize: 50 }));
  vi.stubGlobal('fetch', fetcher);
  render(<StaffQueue shopId={shopId} role="SA" />);
  await waitFor(() => expect(screen.getAllByRole('link', { name: 'Brake concern' })).toHaveLength(50));
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  await screen.findByText('End of the ledger.');
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.anything());
});
it('refuses a shared record from another shop', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...booking, shopId: userId, history: [] })));
  render(<BookingRecord id={slotId} shopId={shopId} returnTo="/workshop" />);
  await screen.findByText('Record unavailable.');
  expect(screen.queryByText('Brake concern')).toBeNull();
});
