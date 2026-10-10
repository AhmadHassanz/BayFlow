import { expect, it } from 'vitest';
import { procurementRows, selectedPartQuantities } from '@/lib/booking/parts-desk';
import { partsBooking, partsOrder, partsActor } from './parts-desk-fixtures';
import { estimatePart, estimateShop, estimateBooking, estimateTime, estimateId } from './estimate-fixtures';

it('derives uncovered orders from authoritative required stock and outstanding purchase-order quantities', () => {
  const booking = { ...partsBooking, requiredParts: [{ ...partsBooking.requiredParts[0], quantityOnHand: 1, shortageQuantity: 1 }],
    purchaseOrders: [{ id: partsOrder, shopId: estimateShop, bookingId: estimateBooking, createdBy: partsActor, status: 'PARTIALLY_RECEIVED' as const,
      supplierName: null, orderedAt: estimateTime, receivedAt: null, items: [{ id: estimateId, partId: estimatePart, quantityOrdered: 2, quantityReceived: 1 }] }] };
  expect(procurementRows(booking)?.[0]).toMatchObject({ name: 'Drive belt', outstanding: 1, uncovered: 0 });
  expect(procurementRows(partsBooking)?.[0].uncovered).toBe(2);
});
it('refuses missing/unapproved or inconsistent requirements and foreign purchase orders', () => {
  expect(procurementRows({ ...partsBooking, estimates: [] })).toBeNull();
  expect(procurementRows({ ...partsBooking, requiredParts: [] })).toBeNull();
  expect(procurementRows({ ...partsBooking, estimates: [{ ...partsBooking.estimates[0], state: 'SENT' }] })).toBeNull();
  const foreign = { id: partsOrder, shopId: estimatePart, bookingId: estimateBooking, createdBy: partsActor, status: 'ORDERED' as const, supplierName: null, orderedAt: estimateTime, receivedAt: null, items: [] };
  expect(procurementRows({ ...partsBooking, purchaseOrders: [foreign] })).toBeNull();
});
it('keeps the labour-only flow valid without invented inventory requirements', () => {
  expect(procurementRows({ ...partsBooking, requiredParts: [], estimates: [{ ...partsBooking.estimates[0], items: [partsBooking.estimates[0].items[1]] }] })).toEqual([]);
});
it.each(['-1', '1.5', '1e2', '3', '1000000000'])('rejects invalid or over-limit receipt/order quantity %s', quantity => {
  expect(() => selectedPartQuantities({ [estimatePart]: quantity }, new Map([[estimatePart, 2]]))).toThrow();
});
it('requires positive selected quantities, omits blank/zero rows and rejects unknown part IDs', () => {
  expect(selectedPartQuantities({ [estimatePart]: '1', [estimateId]: '' }, new Map([[estimatePart, 2], [estimateId, 3]]))).toEqual([{ partId: estimatePart, quantity: 1 }]);
  expect(() => selectedPartQuantities({ [estimatePart]: '0' }, new Map([[estimatePart, 2]]))).toThrow();
  expect(() => selectedPartQuantities({ [estimateId]: '1' }, new Map([[estimatePart, 2]]))).toThrow();
});
