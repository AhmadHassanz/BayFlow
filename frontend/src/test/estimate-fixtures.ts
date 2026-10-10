import { bookingDetailOutput, estimateOutput } from '@/lib/contracts/booking-actions';
export const estimateShop = 'b1100000-0000-4000-8000-000000001001';
export const estimateBooking = 'b1100000-0000-4000-8000-000000000101';
export const estimateCustomer = 'b1100000-0000-4000-8000-000000000003';
export const estimatePart = 'b1100000-0000-4000-8000-000000003001';
export const estimateId = 'b1100000-0000-4000-8000-000000004001';
export const secondEstimateId = 'b1100000-0000-4000-8000-000000004002';
export const estimateTime = '2026-10-10T10:00:00Z';
export const reviewEstimate = estimateOutput.parse({ id: estimateId, bookingId: estimateBooking, shopId: estimateShop,
  revisionNo: 1, state: 'REVIEW', diagnosisNote: 'Belt worn after inspection', subtotalPkr: 7400,
  createdAt: estimateTime, sentAt: null, decidedAt: null, items: [
    { id: estimatePart, kind: 'PART', partId: estimatePart, descriptionSnapshot: 'Drive belt', quantity: 1, unitPricePkr: 6500, lineTotalPkr: 6500 },
    { id: estimateId, kind: 'LABOUR', partId: null, descriptionSnapshot: 'Fit belt', quantity: 1, unitPricePkr: 900, lineTotalPkr: 900 },
  ] });
export const reviewBooking = bookingDetailOutput.parse({ id: estimateBooking, shopId: estimateShop, customerId: estimateCustomer,
  vehicleId: estimatePart, slotId: estimatePart, status: 'ESTIMATE_REVIEW', stateVersion: 4, symptomNotes: 'Belt squeals', serviceIds: [],
  createdAt: estimateTime, technicianUserId: estimatePart, partsUserId: null, qcClaimedBy: null, completedAt: null, history: [], estimates: [reviewEstimate] });
export const sentEstimate = { ...reviewEstimate, state: 'SENT' as const, sentAt: estimateTime };
export const sentBooking = { ...reviewBooking, status: 'AWAITING_CUSTOMER' as const, stateVersion: 5, estimates: [sentEstimate] };
