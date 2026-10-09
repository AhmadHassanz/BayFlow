import { expect, it } from 'vitest';
import { bookingPayload, readDraft, writeDraft, initialBookingValues, emptyBookingForm, draftKey, type DraftStorage, type SavedDraft } from '@/lib/booking/draft';
import { shopId, serviceId, slotId } from './public-fixtures';
const key = 'b1100000-0000-4000-8000-000000009001';
function storage(): DraftStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
const fields = { ...emptyBookingForm, date: '2026-10-11', slotId, serviceIds: [serviceId], registrationPlate: ' lea-1234 ', make: ' Honda ', model: 'Civic', year: '2016', mileageKm: '0' };
function draft(): SavedDraft { return { version: 1, shopId, savedAt: 1, step: 4, values: fields, pending: null, receipt: null }; }

it('maps form fields to the frozen booking contract without auth credentials or client authority', () => {
  const payload = bookingPayload(shopId, fields, key);
  expect(payload.vehicle).toEqual({ registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileageKm: 0 });
  expect(Object.keys(payload).sort()).toEqual(['idempotencyKey', 'serviceIds', 'shopId', 'slotId', 'symptomNotes', 'vehicle']);
  expect(() => bookingPayload(shopId, { ...fields, year: '1e3' }, key)).toThrow();
  expect(() => bookingPayload(shopId, { ...fields, mileageKm: '2.5' }, key)).toThrow();
});

it('supports symptom-only bookings using the same server validation rules', () => {
  expect(bookingPayload(shopId, { ...fields, serviceIds: [], symptomNotes: 'Engine stalls at idle.' }, key).serviceIds).toEqual([]);
  for (const symptomNotes of ['', '..........', 'short']) expect(() => bookingPayload(shopId, { ...fields, serviceIds: [], symptomNotes }, key)).toThrow();
});

it('round trips a pending actor-bound request and never accepts passwords or a foreign shop', () => {
  const store = storage(); const value = { ...draft(), pending: { actorId: key, payload: bookingPayload(shopId, fields, key) } };
  writeDraft(store, value); expect(readDraft(store, shopId)).toEqual(value);
  store.setItem(draftKey(shopId), JSON.stringify({ ...value, password: 'must-not-be-persisted' }));
  expect(readDraft(store, shopId)).toBeNull();
  store.setItem(draftKey(shopId), JSON.stringify({ ...value, shopId: key })); expect(readDraft(store, shopId)).toBeNull();
});

it('recovers gracefully from corrupt JSON and invalid draft versions', () => {
  const store = storage();
  for (const value of ['{broken', JSON.stringify({ ...draft(), version: 2 }), JSON.stringify({ ...draft(), step: 99 })]) {
    store.setItem(draftKey(shopId), value); expect(readDraft(store, shopId)).toBeNull();
  }
});

it('invalidates expired dates and only accepts same-horizon URL hints', () => {
  const dates = ['2026-10-12', '2026-10-13'];
  const values = initialBookingValues(shopId, draft(), { date: '2026-12-01', slot: slotId }, dates);
  expect(values.date).toBe(dates[0]); expect(values.slotId).toBe('');
  const hinted = initialBookingValues(shopId, null, { date: dates[1], slot: slotId, service: serviceId }, dates);
  expect(hinted).toMatchObject({ serviceIds: [serviceId], date: dates[1], slotId });
});

it('preserves a pending payload exactly across reloads even when URL hints differ or the date has elapsed', () => {
  const value = { ...draft(), pending: { actorId: key, payload: bookingPayload(shopId, fields, key) } };
  expect(initialBookingValues(shopId, value, { date: '2026-10-20', slot: key, service: key }, ['2026-10-20'])).toEqual(fields);
});
