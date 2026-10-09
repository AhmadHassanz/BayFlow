import { z } from 'zod';
import { uuid } from './auth';
const identifier = uuid.transform(value => value.toLowerCase());

export const bookingStatus = z.enum(['PENDING', 'CONFIRMED', 'ASSIGNED', 'INSPECTING', 'ESTIMATE_REVIEW',
  'AWAITING_CUSTOMER', 'ESTIMATE_APPROVED', 'ESTIMATE_REJECTED', 'PARTS_PENDING', 'PARTS_ORDERED',
  'PARTS_READY', 'IN_REPAIR', 'QC_PENDING', 'QC_IN_PROGRESS', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED']);
export const bookingVehicle = z.object({
  registrationPlate: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 -]{1,19}$/),
  make: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1886).max(9999), color: z.string().trim().min(1).max(40).nullable().default(null),
  mileageKm: z.number().int().min(0).max(2147483647).nullable().default(null),
}).strict();
export const createBookingInput = z.object({
  shopId: identifier, slotId: identifier, serviceIds: z.array(identifier).max(50).refine(ids => new Set(ids).size === ids.length,
    'Select each service once.').transform(ids => [...ids].sort()),
  symptomNotes: z.string().trim().max(4000).default(''), vehicle: bookingVehicle, idempotencyKey: identifier,
}).strict().refine(value => value.serviceIds.length > 0 ||
  (value.symptomNotes.length >= 10 && (value.symptomNotes.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 5),
  'Select services or describe meaningful symptoms.');
export const bookingCreationOutput = z.object({ id: uuid, shopId: uuid, customerId: uuid, vehicleId: uuid,
  slotId: uuid, status: bookingStatus, stateVersion: z.number().int().nonnegative(), symptomNotes: z.string(),
  serviceIds: z.array(uuid), createdAt: z.string() });
export const bookingRpcOutput = z.object({ booking: bookingCreationOutput, replayed: z.boolean() });
export type CreateBookingInput = z.infer<typeof createBookingInput>;
