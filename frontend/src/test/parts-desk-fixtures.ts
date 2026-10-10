import { reviewBooking, reviewEstimate, estimatePart, estimateId, secondEstimateId } from './estimate-fixtures';
import type { JobRecord } from '@/lib/booking/advisor-actions';
export const partsActor = estimateId;
export const partsOrder = secondEstimateId;
export const partsBooking: JobRecord = { ...reviewBooking, status: 'PARTS_PENDING', stateVersion: 7, partsUserId: partsActor,
  estimates: [{ ...reviewEstimate, state: 'APPROVED', items: [{ ...reviewEstimate.items[0], quantity: 2, lineTotalPkr: 13000 }, reviewEstimate.items[1]], subtotalPkr: 13900 }],
  requiredParts: [{ partId: estimatePart, quantityRequired: 2, quantityOnHand: 0, quantityAllocated: 0, shortageQuantity: 2 }],
};
