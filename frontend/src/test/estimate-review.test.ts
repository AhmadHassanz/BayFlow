import { expect, it } from 'vitest';
import { buildReviewPayload, customerCanDecide, estimatesBelongToBooking, latestEstimate, reviewDraft, reviewPreview } from '@/lib/booking/estimate-review';
import { reviewBooking, reviewEstimate, sentBooking, sentEstimate, estimateCustomer, estimatePart, secondEstimateId } from './estimate-fixtures';

it('selects the highest actual revision independent of API array order', () => {
  const newer = { ...sentEstimate, id: secondEstimateId, revisionNo: 2 };
  expect(latestEstimate({ ...sentBooking, estimates: [sentEstimate, newer] })?.id).toBe(secondEstimateId);
  expect(latestEstimate({ ...sentBooking, estimates: [newer, sentEstimate] })?.id).toBe(secondEstimateId);
});
it('permits decisions only on an owning customer booking with a complete latest sent snapshot', () => {
  expect(customerCanDecide(sentBooking, estimateCustomer)).toBe(true);
  expect(customerCanDecide(sentBooking, estimatePart)).toBe(false);
  expect(customerCanDecide(reviewBooking, estimateCustomer)).toBe(false);
  for (const state of ['REVIEW', 'DRAFT', 'APPROVED', 'REJECTED'] as const)
    expect(customerCanDecide({ ...sentBooking, estimates: [sentEstimate, { ...sentEstimate, id: secondEstimateId, revisionNo: 2, state }] }, estimateCustomer)).toBe(false);
  expect(customerCanDecide({ ...sentBooking, estimates: [{ ...sentEstimate, sentAt: null }] }, estimateCustomer)).toBe(false);
  expect(customerCanDecide({ ...sentBooking, estimates: [{ ...sentEstimate, items: [] }] }, estimateCustomer)).toBe(false);
});
it('refuses inconsistent snapshot tenant/booking bindings and duplicate revision numbers', () => {
  for (const estimates of [[{ ...sentEstimate, bookingId: estimatePart }], [{ ...sentEstimate, shopId: estimatePart }], [sentEstimate, { ...sentEstimate, id: secondEstimateId }]]) {
    const booking = { ...sentBooking, estimates };
    expect(estimatesBelongToBooking(booking)).toBe(false);
    expect(latestEstimate(booking)).toBeNull();
    expect(customerCanDecide(booking, estimateCustomer)).toBe(false);
  }
});
it('copies source rows and edits independently without rewriting the server snapshot or transmitting totals', () => {
  const draft = reviewDraft(reviewBooking, reviewEstimate);
  draft.rows[1].price = '1200'; draft.rows[0].quantity = '2';
  expect(reviewPreview(draft.rows)).toBe(14200n);
  const payload = buildReviewPayload(draft);
  expect(payload.items[0]).toMatchObject({ kind: 'PART', partId: estimatePart, quantity: 2 });
  expect(payload.items[1]).toMatchObject({ kind: 'LABOUR', partId: null, unitPricePkr: 1200 });
  expect(payload).not.toHaveProperty('subtotalPkr');
  expect(payload.items[0]).not.toHaveProperty('lineTotalPkr');
  expect(reviewEstimate.items[1].unitPricePkr).toBe(900);
  expect(reviewEstimate.subtotalPkr).toBe(7400);
});
it.each(['', '-1', '9.5', '1e3', '1000000000'])('rejects invalid price %s before a send/revision intent', price => {
  const draft = reviewDraft(reviewBooking, reviewEstimate); draft.rows[0].price = price;
  expect(() => buildReviewPayload(draft)).toThrow();
});
it('validates server total limits, item/diagnosis bounds, zero price and recorded PART identities', () => {
  const draft = reviewDraft(reviewBooking, reviewEstimate);
  draft.rows[0].price = '0'; expect(buildReviewPayload(draft).items[0].unitPricePkr).toBe(0);
  draft.rows[0].partId = secondEstimateId; expect(() => buildReviewPayload(draft)).toThrow(/Part identities/);
  draft.rows[0].partId = estimatePart; draft.rows[0].quantity = '999999999'; draft.rows[0].price = '999999999';
  expect(() => buildReviewPayload(draft)).toThrow(/server limit/);
  draft.rows = []; expect(() => buildReviewPayload(draft)).toThrow();
  draft.rows = reviewDraft(reviewBooking, reviewEstimate).rows; draft.diagnosis = 'no'; expect(() => buildReviewPayload(draft)).toThrow();
});
