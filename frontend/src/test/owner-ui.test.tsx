// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OwnerOverview } from '@/components/owner/OwnerOverview';
import { ShopForm } from '@/components/owner/ShopForm';
import { ShopSettings } from '@/components/owner/ShopSettings';
import { StaffCreate } from '@/components/owner/StaffCreate';
import { TeamManager } from '@/components/owner/TeamManager';
import { ServicesManager } from '@/components/owner/ServicesManager';
import { shopId, fixtureShop } from './public-fixtures';
const { services: fixtureServices, ...publicShop } = fixtureShop;
const shop = { ...publicShop, active: true };
const counts = { pending: 3, inProgress: 5, readyForPickup: 1, completed: 12 };
const service = { ...fixtureServices.items[0], active: false };
const member = { id: 'b1100000-0000-4000-8000-000000007001', shopId, userId: 'b1100000-0000-4000-8000-000000000001', role: 'SA', active: true, fullName: 'Test Advisor' };
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
const failure = (status: number, code: string) => new Response(JSON.stringify({ data: null, error: { code, message: 'PRIVATE_RESPONSE' } }), { status });
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('shows actual per-shop API counts and manage links', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ items: [{ shop, counts }], page: 1, pageSize: 50, total: 1 })));
  render(<OwnerOverview />);
  await screen.findByText('Test Workshop');
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Manage workshop/ }).getAttribute('href')).toBe(`/shops/${shopId}/settings`);
});
it('handles index errors/retry and an empty first-owner state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => ok({ items: [], page: 1, pageSize: 50, total: 0 })));
  render(<OwnerOverview />);
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
  await screen.findByText('Your first workshop starts here.');
});
it('validates a new shop before posting and uses only contract fields', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok(shop)); const saved = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<ShopForm onSaved={saved} />);
  fireEvent.click(screen.getByRole('button', { name: /Create workshop/ }));
  await screen.findByText('Check the marked fields before saving.'); expect(fetcher).not.toHaveBeenCalled();
  for (const [label, value] of [['Workshop name', 'New Workshop'], ['City', 'Lahore'], ['Phone', '+924235751001'], ['Address', 'Test Road']]) fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Create workshop/ }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({ name: 'New Workshop', timezone: 'Asia/Karachi', slotCapacity: 1, workingHours: {}, active: false });
  expect(body).not.toHaveProperty('ownerId'); expect(body).not.toHaveProperty('slug');
});
it('blocks another create attempt after a lost response', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('lost')); vi.stubGlobal('fetch', fetcher);
  render(<ShopForm onSaved={vi.fn()} />);
  for (const [label, value] of [['Workshop name', 'New Workshop'], ['City', 'Lahore'], ['Phone', '+924235751001'], ['Address', 'Test Road']]) fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Create workshop/ }));
  await screen.findByText('The result is uncertain. Check your workshops before creating another one.');
  expect(screen.getByRole('button', { name: /Create workshop/ }).matches(':disabled')).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('edits hours with split windows, rejects overlaps and explains schedule conflicts', async () => {
  const fetcher = vi.fn().mockImplementation(async () => failure(409, 'SCHEDULE_CONFLICT')); vi.stubGlobal('fetch', fetcher);
  render(<ShopForm shop={shop} section="hours" onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Monday window 2 opens'), { target: { value: '11:00' } });
  fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
  await screen.findByText('Complete every window. Hours must be ordered, non-overlapping and within one day.');
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Monday window 2 opens'), { target: { value: '13:00' } });
  fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
  await screen.findByText(/Existing bookings conflict/);
  expect(screen.queryByText('PRIVATE_RESPONSE')).toBeNull();
});
it('uses selectable quarter-hour choices and defaults a newly opened day to 9 AM–5 PM', () => {
  vi.stubGlobal('fetch', vi.fn());
  render(<ShopForm shop={shop} section="hours" onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add window for Sunday' }));
  const opens = screen.getByLabelText('Sunday window 1 opens') as HTMLSelectElement;
  const closes = screen.getByLabelText('Sunday window 1 closes') as HTMLSelectElement;
  expect(opens.tagName).toBe('SELECT'); expect(closes.tagName).toBe('SELECT');
  expect(opens.value).toBe('09:00'); expect(closes.value).toBe('17:00');
  expect(opens.selectedOptions[0].textContent).toBe('9:00 AM');
  expect(closes.selectedOptions[0].textContent).toBe('5:00 PM');
  expect(opens.options).toHaveLength(96);
});
it('switches the owner sections and loads inactive services through the private scope', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => url.includes('/services?') ? ok({ items: [service], page: 1, pageSize: 50, total: 1 }) : ok({ shop, counts }));
  vi.stubGlobal('fetch', fetcher);
  render(<ShopSettings shopId={shopId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Services' }));
  await screen.findByText('Brake inspection');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('scope=owner'), expect.anything());
});
it('saves whole-PKR service edits and can reactivate a service', async () => {
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'PATCH' ? ok({ ...service, active: true, basePricePkr: 1200 }) : ok({ items: [service], page: 1, pageSize: 50, total: 1 }));
  vi.stubGlobal('fetch', fetcher);
  render(<ServicesManager shopId={shopId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Brake inspection' }));
  fireEvent.change(screen.getByLabelText('Guide price (whole PKR)'), { target: { value: '12.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
  await screen.findByText('Check the service fields. Prices must be whole PKR amounts.');
  expect(fetcher.mock.calls.filter(call => call[1].method === 'PATCH')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Guide price (whole PKR)'), { target: { value: '1200' } });
  fireEvent.click(screen.getByLabelText('Offer this service in the customer catalog'));
  fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
  await screen.findByText(/Service saved/);
  const mutation = fetcher.mock.calls.find(call => call[1].method === 'PATCH')!;
  expect(JSON.parse(mutation[1].body)).toMatchObject({ active: true, basePricePkr: 1200 });
});
async function fillStaff() {
  fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'New Staff' } });
  fireEvent.change(screen.getByLabelText('Email address *'), { target: { value: 'new@example.test' } });
  fireEvent.change(screen.getByLabelText('Initial password *'), { target: { value: 'Synthetic-Test-Password!' } });
  fireEvent.click(screen.getByRole('button', { name: /Create staff account/ }));
}
it('shows supplied credentials only after authoritative staff creation and never persists them', async () => {
  const store = vi.spyOn(Storage.prototype, 'setItem'); const created = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok(member)));
  render(<StaffCreate shopId={shopId} onCreated={created} />);
  await fillStaff();
  await screen.findByText('Save these credentials privately.');
  expect((screen.getByLabelText('Initial password') as HTMLInputElement).type).toBe('password');
  expect((screen.getByLabelText('Initial password') as HTMLInputElement).value).toBe('Synthetic-Test-Password!');
  expect(store).not.toHaveBeenCalled(); expect(created).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Add another staff account' }));
  expect((screen.getByLabelText('Initial password *') as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('button', { name: /Create staff account/ })).toBeTruthy();
});
it('does not overwrite existing credentials on duplicate email', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failure(409, 'EMAIL_EXISTS')));
  render(<StaffCreate shopId={shopId} onCreated={vi.fn()} />);
  await fillStaff(); await screen.findByText(/That email already has an account/);
  expect(screen.queryByText('Save these credentials privately.')).toBeNull();
});
it('blocks further creation and clears the password after an incomplete provisioning response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failure(500, 'STAFF_PROVISIONING_INCOMPLETE')));
  render(<StaffCreate shopId={shopId} onCreated={vi.fn()} />);
  await fillStaff(); await screen.findByText(/Staff setup needs operator review/);
  expect(screen.getByRole('button', { name: /Create staff account/ }).matches(':disabled')).toBe(true);
  expect((screen.getByLabelText('Initial password *') as HTMLInputElement).value).toBe('');
});
it('requires explicit confirmation to deactivate staff, protects owner membership and refetches after success', async () => {
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'PATCH' ? ok({ ...member, active: false }) : ok({ items: [member, { ...member, id: shopId, role: 'OWNER', fullName: 'Owner' }], page: 1, pageSize: 50, total: 2 }));
  vi.stubGlobal('fetch', fetcher);
  render(<TeamManager shopId={shopId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
  await screen.findByRole('dialog');
  expect(fetcher.mock.calls.filter(call => call[1].method === 'PATCH')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Membership updated. The team list is refreshing.');
  const mutation = fetcher.mock.calls.find(call => call[1].method === 'PATCH')!;
  expect(JSON.parse(mutation[1].body)).toEqual({ active: false });
  expect(mutation[0]).toContain(member.id);
});
it('handles revoked owner access without displaying sensitive response bodies', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failure(403, 'FORBIDDEN')));
  render(<ShopSettings shopId={shopId} />);
  await screen.findByText('Record unavailable.'); expect(screen.queryByText('PRIVATE_RESPONSE')).toBeNull();
});
it('role changes are confirmed and limited to the four staff roles', async () => {
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'PATCH' ? ok({ ...member, role: 'TECHNICIAN' }) : ok({ items: [member], page: 1, pageSize: 50, total: 1 }));
  vi.stubGlobal('fetch', fetcher);
  render(<TeamManager shopId={shopId} />);
  const selector = await screen.findByLabelText('Role for Test Advisor');
  expect(Array.from((selector as HTMLSelectElement).options).map(option => option.value)).toEqual(['SA', 'TECHNICIAN', 'PARTS', 'QC']);
  fireEvent.change(selector, { target: { value: 'TECHNICIAN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply role' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Membership updated. The team list is refreshing.');
  const mutation = fetcher.mock.calls.find(call => call[1].method === 'PATCH')!;
  expect(JSON.parse(mutation[1].body)).toEqual({ role: 'TECHNICIAN' });
});
it('creates a service with a nullable guide price and no fabricated catalog identifiers', async () => {
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST' ? ok({ ...service, active: true, basePricePkr: null }) : ok({ items: [], page: 1, pageSize: 50, total: 0 }));
  vi.stubGlobal('fetch', fetcher);
  render(<ServicesManager shopId={shopId} />);
  fireEvent.click(screen.getByRole('button', { name: /Add service/ }));
  fireEvent.change(screen.getByLabelText('Service name *'), { target: { value: 'Inspection' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
  await screen.findByText(/Service saved/);
  const mutation = fetcher.mock.calls.find(call => call[1].method === 'POST')!;
  expect(JSON.parse(mutation[1].body)).toEqual({ name: 'Inspection', description: '', durationMinutes: 60, basePricePkr: null, active: true });
});
it('handles expired owner sessions with a safe return link', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failure(401, 'UNAUTHENTICATED')));
  render(<ShopSettings shopId={shopId} />);
  const link = await screen.findByRole('link', { name: 'Sign in' });
  expect(link.getAttribute('href')).toContain(encodeURIComponent(`/shops/${shopId}/settings`));
});
