// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { loadNotificationFeed, markRead, notificationDestination } from '@/lib/api/notifications';
import { estimateCustomer as userId, estimateBooking as bookingId, estimateShop as shopId, estimateId as id, estimatePart as otherId, estimateTime as time } from './estimate-fixtures';
vi.mock('next/navigation', () => ({ usePathname: () => `/customer/bookings/${bookingId}` }));
const identity = { user: { id: userId, fullName: 'Recipient', phone: null, email: null }, memberships: [] };
const notice = { id, userId, shopId, bookingId, type: 'ESTIMATE_SENT', title: 'Estimate ready', message: 'Review the sent estimate.', readAt: null, createdAt: time };
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('renders real recipient updates, unread state, safe booking destination and closes with focus restoration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ok(url === '/api/v1/me' ? identity : { items: [notice], unreadCount: 1, limit: 20 })));
  render(<NotificationBell userId={userId} />); const trigger = await screen.findByRole('button', { name: 'Notifications · 1 unread' });
  fireEvent.click(trigger); await screen.findByText('Review the sent estimate.');
  expect(screen.getByRole('link', { name: /View booking/ }).getAttribute('href')).toBe(`/customer/bookings/${bookingId}`);
  expect(screen.getByText('Unread')).toBeTruthy();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it('marks read once despite duplicate clicks and uses authoritative refreshed count', async () => {
  let read = false; let finish: (response: Response) => void = () => {};
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url === '/api/v1/me') return ok(identity);
    if (options.method === 'POST') return new Promise<Response>(resolve => { finish = resolve; });
    return ok({ items: [{ ...notice, readAt: read ? time : null }], unreadCount: read ? 0 : 1, limit: 20 });
  }); vi.stubGlobal('fetch', fetcher); render(<NotificationBell userId={userId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Notifications · 1 unread' }));
  const mark = await screen.findByRole('button', { name: 'Mark Estimate ready as read' }); fireEvent.click(mark); fireEvent.click(mark);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Mark Estimate ready as read' }).hasAttribute('disabled')).toBe(true);
  read = true; finish(ok({ ...notice, readAt: time }));
  await screen.findByRole('button', { name: 'Notifications · 0 unread' }); expect(screen.getByText('Read')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/notifications/${id}/read`, expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }));
});
it('polls every 25 seconds when visible, refetches on focus and removes timers on unmount', async () => {
  vi.useFakeTimers(); const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const fetcher = vi.fn().mockImplementation(async (url: string) => ok(url === '/api/v1/me' ? identity : { items: [], unreadCount: 0, limit: 20 }));
  vi.stubGlobal('fetch', fetcher); const view = render(<NotificationBell userId={userId} />);
  await act(async () => {}); expect(screen.getByRole('button', { name: 'Notifications · 0 unread' })).toBeTruthy();
  const calls = fetcher.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(25000); }); expect(fetcher.mock.calls.length).toBe(calls + 2);
  visibility.mockReturnValue('hidden'); const hiddenCalls = fetcher.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(25000); }); expect(fetcher.mock.calls.length).toBe(hiddenCalls);
  visibility.mockReturnValue('visible'); await act(async () => { window.dispatchEvent(new Event('focus')); }); expect(fetcher.mock.calls.length).toBe(hiddenCalls + 2);
  view.unmount(); const finalCalls = fetcher.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); expect(fetcher.mock.calls.length).toBe(finalCalls);
});
it('filters unread updates using the existing query and renders all returned notification types', async () => {
  const types = ['NEW_BOOKING', 'TECHNICIAN_ASSIGNED', 'ESTIMATE_READY_FOR_REVIEW', 'ESTIMATE_SENT', 'ESTIMATE_APPROVED', 'ESTIMATE_REJECTED', 'PARTS_ASSIGNED', 'QC_FAILED', 'QC_PASSED', 'READY_FOR_PICKUP'];
  const fetcher = vi.fn().mockImplementation(async (url: string) => ok(url === '/api/v1/me' ? identity : { items: types.map((type, index) => ({ ...notice, id: `b1100000-0000-4000-8000-${String(index).padStart(12, '0')}`, type, title: type })), unreadCount: types.length, limit: 20 }));
  vi.stubGlobal('fetch', fetcher); render(<NotificationBell userId={userId} />);
  fireEvent.click(await screen.findByRole('button', { name: `Notifications · ${types.length} unread` }));
  await screen.findByText('QC_FAILED'); for (const type of types) expect(screen.getByText(type)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Unread only' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/v1/notifications?unread=true&limit=20', expect.anything()));
});
it('suppresses foreign recipient data and count instead of exposing it during an account change', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ok(url === '/api/v1/me' ? identity : { items: [{ ...notice, userId: otherId, title: 'PRIVATE FOREIGN UPDATE' }], unreadCount: 71, limit: 20 })));
  render(<NotificationBell userId={userId} />); fireEvent.click(await screen.findByRole('button', { name: 'Notifications unavailable' }));
  await screen.findByText('Record unavailable.'); expect(screen.queryByText('PRIVATE FOREIGN UPDATE')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Notifications · 71 unread' })).toBeNull();
});
it('handles expired sessions with a preserved deep-link sign-in and network errors with retry', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response('PRIVATE', { status: 401 })); vi.stubGlobal('fetch', fetcher);
  const view = render(<NotificationBell userId={userId} />); fireEvent.click(await screen.findByRole('button', { name: 'Notifications unavailable' }));
  const signIn = await screen.findByRole('link', { name: 'Sign in' }); expect(signIn.getAttribute('href')).toContain(encodeURIComponent(`/customer/bookings/${bookingId}`)); view.unmount();
  fetcher.mockRejectedValueOnce(new Error('PRIVATE')).mockImplementation(async (url: string) => ok(url === '/api/v1/me' ? identity : { items: [], unreadCount: 0, limit: 20 }));
  render(<NotificationBell userId={userId} />); fireEvent.click(await screen.findByRole('button', { name: 'Notifications unavailable' }));
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ })); await screen.findByText('No updates yet.'); expect(screen.queryByText('PRIVATE')).toBeNull();
});
it('keeps uncertain read markers retryable and never decrements count locally', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (options.method === 'POST') throw new Error('lost response'); return ok(url === '/api/v1/me' ? identity : { items: [notice], unreadCount: 1, limit: 20 });
  }); vi.stubGlobal('fetch', fetcher); render(<NotificationBell userId={userId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Notifications · 1 unread' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mark Estimate ready as read' })); await screen.findByText(/could not verify the read marker/);
  expect(screen.getByRole('button', { name: 'Notifications · 1 unread' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Mark Estimate ready as read' }).hasAttribute('disabled')).toBe(false);
});
it('validates marker identity and safely resolves verified active membership links only', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...notice, id: otherId, readAt: time })));
  await expect(markRead(id, userId)).rejects.toThrow('Unexpected read-marker');
  const member = { id, shopId, userId, role: 'TECHNICIAN' as const, active: true };
  expect(notificationDestination(notice, [member])).toBe(`/shops/${shopId}/bookings/${bookingId}`);
  expect(notificationDestination(notice, [{ ...member, active: false }])).toBe(`/customer/bookings/${bookingId}`);
  expect(notificationDestination({ ...notice, bookingId: null }, [member])).toBeNull();
});
it('rejects a changed verified identity before requesting a feed and provides a keyboard-focusable labelled table region', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ok({ ...identity, user: { ...identity.user, id: otherId } })); vi.stubGlobal('fetch', fetcher);
  await expect(loadNotificationFeed(userId, false, new AbortController().signal)).rejects.toMatchObject({ status: 403 }); expect(fetcher).toHaveBeenCalledTimes(1);
  render(<ScrollableTable label="Stock columns"><table><caption>Stock</caption><tbody><tr><td>Part</td></tr></tbody></table></ScrollableTable>);
  const region = screen.getByRole('region', { name: 'Stock columns' }); expect(region.getAttribute('tabindex')).toBe('0'); region.focus(); expect(document.activeElement).toBe(region);
});
