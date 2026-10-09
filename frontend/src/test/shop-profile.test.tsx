// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShopProfile } from '@/components/public/ShopProfile';
import { fixtureShop, shopId, slotId, serviceId } from './public-fixtures';
import { calendarDates, localDate, moneyPkr } from '@/lib/format';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mockSlots(data: unknown = []) {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data, error: null }))));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('renders real profile fields, split hours, closed days, neutral reviews and service booking URLs', async () => {
  mockSlots(); render(<ShopProfile shop={fixtureShop} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Test Workshop');
  expect(screen.getByText('09:00–12:00 / 13:00–18:00')).toBeTruthy();
  expect(screen.getAllByText('Closed').length).toBe(6);
  expect(screen.getByText('Customer reviews are not available. Explore the listed services or speak directly with the workshop.')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Book this service/ }).getAttribute('href')).toBe(`/book/${shopId}?service=${serviceId}`);
  expect(screen.getByRole('link', { name: /Book a visit/ }).getAttribute('href')).toBe(`/book/${shopId}`);
  expect(screen.getByText('PKR 1,500')).toBeTruthy();
  await screen.findByText('No appointments listed for this day');
});

it('uses the shop calendar horizon and refreshes slots when a date is changed', async () => {
  const fetcher = mockSlots(); const user = userEvent.setup();
  render(<ShopProfile shop={fixtureShop} />);
  const dates = calendarDates(fixtureShop.timezone);
  expect(screen.getAllByRole('option')).toHaveLength(14);
  await screen.findByText('No appointments listed for this day');
  await user.selectOptions(screen.getByLabelText('Appointment date'), dates[1]);
  await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(`/api/v1/shops/${shopId}/slots?date=${dates[1]}`, expect.objectContaining({ cache: 'no-store' })));
});

it('offers only available slots, carries date/slot IDs, and marks full appointments explicitly', async () => {
  const date = calendarDates(fixtureShop.timezone)[0];
  mockSlots([
    { id: slotId, shopId, startsAt: `${date}T04:00:00Z`, endsAt: `${date}T05:00:00Z`, capacity: 1, capacityRemaining: 1 },
    { id: 'b1100000-0000-4000-8000-000000004002', shopId, startsAt: `${date}T05:00:00Z`, endsAt: `${date}T06:00:00Z`, capacity: 1, capacityRemaining: 0 },
  ]);
  render(<ShopProfile shop={fixtureShop} />);
  const slot = await screen.findByRole('link', { name: /9:00 am.*1 place available/i });
  expect(slot.getAttribute('href')).toBe(`/book/${shopId}?date=${date}&slot=${slotId}`);
  expect(screen.getByText('Fully booked')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Fully booked/ })).toBeNull();
});

it('keeps profile readable when slots fail and supports retry without showing server diagnostics', async () => {
  const fetcher = mockSlots(); fetcher.mockResolvedValueOnce(new Response('private diagnostic', { status: 500 }));
  const user = userEvent.setup(); render(<ShopProfile shop={fixtureShop} />);
  expect((await screen.findByRole('alert')).textContent).not.toContain('private diagnostic');
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /Try again/ }));
  await screen.findByText('No appointments listed for this day');
});

it('does not invent a price for an unpriced service and can render a catalog without services', async () => {
  mockSlots();
  const shop = { ...fixtureShop, services: { ...fixtureShop.services, items: [{ ...fixtureShop.services.items[0], basePricePkr: null }] } };
  const { unmount } = render(<ShopProfile shop={shop} />);
  expect(screen.getByText('Price after inspection')).toBeTruthy(); unmount();
  render(<ShopProfile shop={{ ...fixtureShop, services: { ...fixtureShop.services, total: 0, items: [] } }} />);
  expect(screen.getByText('Tell us what you are noticing')).toBeTruthy();
  await screen.findByText('No appointments listed for this day');
});

it('formats Pakistan dates across UTC midnight and preserves integer PKR pricing', () => {
  const instant = new Date('2026-10-10T21:00:00Z');
  expect(localDate('Asia/Karachi', instant)).toBe('2026-10-11');
  const dates = calendarDates('Asia/Karachi', instant);
  expect(dates[0]).toBe('2026-10-11'); expect(dates[13]).toBe('2026-10-24');
  expect(moneyPkr(0)).toBe('PKR 0');
});
