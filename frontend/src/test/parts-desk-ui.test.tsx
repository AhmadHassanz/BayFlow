// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';
import { StaffQueue } from '@/components/workspace/StaffQueue';
import { InventoryLedger } from '@/components/inventory/InventoryLedger';
import { estimateShop as shopId, estimateBooking as id, estimatePart as partId, estimateTime as time } from './estimate-fixtures';
import { partsBooking, partsActor, partsOrder } from './parts-desk-fixtures';
import type { JobRecord } from '@/lib/booking/advisor-actions';
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }));
const inventory = (stock: number) => ({ items: [{ id: partId, shopId, sku: 'BELT', name: 'Drive belt', quantityOnHand: stock, reorderLevel: 1, unitCostPkr: 6500, active: true }], page: 1, pageSize: 50, total: 1 });
const record = () => render(<StaffBookingRecord id={id} shopId={shopId} role="PARTS" actorId={partsActor} returnTo={`/shops/${shopId}/bookings/${id}`} />);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('orders, receives partial/full deltas and allocates using server stock/state across reload', async () => {
  let current: JobRecord = structuredClone(partsBooking);
  const actions: string[] = [];
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.includes('/inventory')) return ok(inventory(current.requiredParts[0].quantityOnHand));
    if (options.method !== 'POST') return ok(current);
    const input = JSON.parse(options.body as string); expect(input.expectedVersion).toBe(current.stateVersion); actions.push(input.action);
    if (input.action === 'ORDER_PARTS') {
      current = { ...current, status: 'PARTS_ORDERED', stateVersion: 8, purchaseOrders: [{ id: partsOrder, shopId, bookingId: id, createdBy: partsActor,
        status: 'ORDERED', supplierName: input.payload.supplierName, orderedAt: time, receivedAt: null,
        items: [{ id: partId, partId, quantityOrdered: 2, quantityReceived: 0 }] }] };
    } else if (input.action === 'RECEIVE_PARTS') {
      const received = current.purchaseOrders[0].items[0].quantityReceived + input.payload.items[0].quantity;
      current = { ...current, status: received === 2 ? 'PARTS_READY' : 'PARTS_ORDERED', stateVersion: received === 2 ? 9 : 8,
        requiredParts: [{ ...current.requiredParts[0], quantityOnHand: received, shortageQuantity: 2 - received }],
        purchaseOrders: [{ ...current.purchaseOrders[0], status: received === 2 ? 'RECEIVED' : 'PARTIALLY_RECEIVED', receivedAt: received === 2 ? time : null,
          items: [{ ...current.purchaseOrders[0].items[0], quantityReceived: received }] }] };
    } else {
      current = { ...current, status: 'IN_REPAIR', stateVersion: 10, requiredParts: [{ ...current.requiredParts[0], quantityOnHand: 0, quantityAllocated: 2, shortageQuantity: 0 }] };
    }
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher); let view = record();
  await screen.findByLabelText('Order quantity Drive belt');
  expect(screen.getByRole('button', { name: 'Mark parts ready' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Order quantity Drive belt'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Supplier name (optional)'), { target: { value: '  Local supplier  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Order missing parts' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('article', { name: `Purchase order ${partsOrder.slice(0, 8)}` });
  expect(current.requiredParts[0].quantityOnHand).toBe(0); // PO creation never adds stock.
  for (const receipt of [1, 2]) {
    fireEvent.change(await screen.findByLabelText(`Delivered now ${partsOrder.slice(0, 8)} ${partId.slice(0, 8)}`), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receive this delivery' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await screen.findByText(`Ordered 2 · Received ${receipt} · Remaining ${2 - receipt}`);
    if (receipt === 1) {
      expect(current.status).toBe('PARTS_ORDERED'); expect(current.stateVersion).toBe(8);
      expect(screen.queryByRole('button', { name: 'Allocate parts and release to repair' })).toBeNull();
      view.unmount(); view = record(); await screen.findByText('Ordered 2 · Received 1 · Remaining 1');
    }
  }
  fireEvent.click(screen.getByRole('button', { name: 'Allocate parts and release to repair' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Before saved action: 2 · Current server stock: 0');
  expect(current.requiredParts[0].quantityAllocated).toBe(2);
  expect(actions).toEqual(['ORDER_PARTS', 'RECEIVE_PARTS', 'RECEIVE_PARTS', 'ALLOCATE_PARTS']);
  const receipts = fetcher.mock.calls.filter(([, options]) => options.method === 'POST').map(([, options]) => JSON.parse(options.body as string));
  expect(receipts[1].payload.items).toEqual([{ partId, quantity: 1 }]); expect(receipts[2].payload.items).toEqual([{ partId, quantity: 1 }]);
  expect(receipts[1].idempotencyKey).not.toBe(receipts[2].idempotencyKey);
  expect(receipts[0].payload.supplierName).toBe('Local supplier');
});
it('shows real SKU/cost/reorder inventory, supports exact paging and safe access failures', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => ok({ ...inventory(0), page: url.includes('page=2') ? 2 : 1, total: 51 }));
  vi.stubGlobal('fetch', fetcher); const view = render(<InventoryLedger shopId={shopId} />);
  await screen.findByText('BELT'); expect(screen.getByText('PKR 6,500')).toBeTruthy(); expect(screen.getByText('At or below reorder level')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next inventory' })); await screen.findByText('Page 2 · 51 records');
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.anything()); view.unmount();
  fetcher.mockImplementation(async () => new Response('PRIVATE STOCK', { status: 403 })); render(<InventoryLedger shopId={shopId} />);
  await screen.findByText('Record unavailable.'); expect(screen.queryByText('PRIVATE STOCK')).toBeNull();
});
it('offers the in-stock shortcut and rejects over-order quantities without mutating', async () => {
  let current = { ...partsBooking, requiredParts: [{ ...partsBooking.requiredParts[0], quantityOnHand: 2, shortageQuantity: 0 }] };
  const fetcher = vi.fn().mockImplementation(async (url: string) => url.includes('/inventory') ? ok(inventory(2)) : ok(current)); vi.stubGlobal('fetch', fetcher);
  const view = record(); await screen.findByRole('button', { name: 'Mark parts ready' });
  expect(screen.getByRole('button', { name: 'Mark parts ready' }).hasAttribute('disabled')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Order missing parts' })).toBeNull(); view.unmount();
  current = partsBooking; record(); fireEvent.change(await screen.findByLabelText('Order quantity Drive belt'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Order missing parts' }));
  expect(screen.getByRole('alert').textContent).toContain('displayed remaining');
  expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
it('handles concurrent stock loss by reloading the actual shortage before another allocation', async () => {
  let current: JobRecord = { ...partsBooking, status: 'PARTS_READY', requiredParts: [{ ...partsBooking.requiredParts[0], quantityOnHand: 2, shortageQuantity: 0 }] };
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.includes('/inventory')) return ok(inventory(current.requiredParts[0].quantityOnHand));
    if (options.method === 'POST') { current = { ...current, requiredParts: [{ ...current.requiredParts[0], quantityOnHand: 0, shortageQuantity: 2 }] }; return new Response(JSON.stringify({ error: { code: 'STOCK_CONFLICT' } }), { status: 409 }); }
    return ok(current);
  }); vi.stubGlobal('fetch', fetcher); record();
  fireEvent.click(await screen.findByRole('button', { name: 'Allocate parts and release to repair' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/Required stock changed before allocation/); fireEvent.click(screen.getByRole('button', { name: 'Reload record' }));
  await screen.findByLabelText('Order quantity Drive belt');
  expect(screen.getByRole('button', { name: 'Allocate parts and release to repair' }).hasAttribute('disabled')).toBe(true);
});
it('retains the identical receipt intent after a lost response and locks duplicate submission', async () => {
  let posts = 0;
  const booked = { ...partsBooking, status: 'PARTS_ORDERED' as const, purchaseOrders: [{ id: partsOrder, shopId, bookingId: id, createdBy: partsActor, status: 'ORDERED' as const, supplierName: null, orderedAt: time, receivedAt: null, items: [{ id: partId, partId, quantityOrdered: 2, quantityReceived: 0 }] }] };
  const fetcher = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.includes('/inventory')) return ok(inventory(0));
    if (options.method === 'POST' && ++posts === 1) throw new Error('lost response'); return ok(booked);
  }); vi.stubGlobal('fetch', fetcher); record();
  fireEvent.change(await screen.findByLabelText(`Delivered now ${partsOrder.slice(0, 8)} ${partId.slice(0, 8)}`), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Receive this delivery' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText(/The result is uncertain/); expect(screen.getByRole('button', { name: 'Keep as is' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same request' })); await waitFor(() => expect(posts).toBe(2));
  const calls = fetcher.mock.calls.filter(([, options]) => options.method === 'POST'); expect(calls[0][1].body).toBe(calls[1][1].body);
});
it('assigns only a returned same-shop parts member after confirmation', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => url.includes('/team') ? ok({ items: [{ userId: partsActor, fullName: 'Parts member' }], page: 1, pageSize: 50, total: 1 })
    : ok({ ...partsBooking, status: 'ESTIMATE_APPROVED', partsUserId: null }));
  vi.stubGlobal('fetch', fetcher); render(<StaffBookingRecord id={id} shopId={shopId} role="SA" returnTo="/advisor" />);
  await screen.findByRole('option', { name: 'Parts member' });
  expect(screen.getByRole('button', { name: 'Assign parts person' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Active parts person'), { target: { value: partsActor } });
  fireEvent.click(screen.getByRole('button', { name: 'Assign parts person' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true));
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options.method === 'POST')![1].body as string)).toMatchObject({ action: 'ASSIGN_PARTS', payload: { partsUserId: partsActor } });
});
it('denies another assigned parts user and suppresses unexpected list assignments', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ ...partsBooking, partsUserId: partId }))); const view = record();
  await screen.findByText('Record unavailable.'); expect(screen.queryByRole('region', { name: 'Parts preparation' })).toBeNull(); view.unmount();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok({ items: [{ ...partsBooking, partsUserId: partId }], page: 1, pageSize: 50 })));
  render(<StaffQueue shopId={shopId} role="PARTS" actorId={partsActor} />); await screen.findByRole('button', { name: /Try again/ });
  expect(screen.queryByRole('link', { name: 'Belt squeals' })).toBeNull();
});
