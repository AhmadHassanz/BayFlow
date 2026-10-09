// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BookingReceipt } from '@/components/booking/BookingReceipt';
import { fixtureShop, shopId, slotId } from './public-fixtures';
vi.mock('@/lib/auth/actions', () => ({ login: vi.fn(), signup: vi.fn(), logout: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const id = 'b1100000-0000-4000-8000-000000009002';

it('requires sign-in when a confirmation is reopened without a verified session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<BookingReceipt shop={fixtureShop} bookingId={id} onNew={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Welcome back.' });
  expect(screen.getByRole('button', { name: /Sign in & continue/ })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Your visit is on the ledger.' })).toBeNull();
});

it.each([403, 404])('hides unavailable confirmation data for HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private diagnostic', { status })));
  render(<BookingReceipt shop={fixtureShop} bookingId={id} onNew={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Booking unavailable.' });
  expect(screen.getByRole('alert').textContent).not.toContain('private');
  expect(screen.queryByText(id)).toBeNull();
});

it('does not display a returned booking under the wrong workshop', async () => {
  const detail = { id, shopId: id, slotId, customerId: id, vehicleId: id, status: 'PENDING', stateVersion: 0, symptomNotes: '', serviceIds: [], createdAt: '2026-10-10T00:00:00Z', technicianUserId: null, partsUserId: null, qcClaimedBy: null, completedAt: null, history: [] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: detail, error: null }))));
  render(<BookingReceipt shop={fixtureShop} bookingId={id} onNew={vi.fn()} />);
  await screen.findByRole('heading', { name: 'A different workshop.' });
  expect(screen.queryByText('Your visit is on the ledger.')).toBeNull();
  expect(shopId).not.toBe(id);
});
