import { z } from 'zod';
import { bookingCreationOutput, bookingStatus } from './bookings';
import { uuid } from './auth';

const identifier = uuid.transform(value => value.toLowerCase());
export const bookingAction = z.enum(['CONFIRM_BOOKING', 'ASSIGN_TECHNICIAN', 'START_INSPECTION', 'CANCEL_BOOKING']);
const baseAction = z.object({
  action: bookingAction,
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: identifier,
}).strict();
export const bookingActionInput = z.discriminatedUnion('action', [
  baseAction.extend({ action: z.literal('CONFIRM_BOOKING'), payload: z.object({}).strict().default({}) }),
  baseAction.extend({
    action: z.literal('ASSIGN_TECHNICIAN'),
    payload: z.object({ technicianUserId: identifier }).strict(),
  }),
  baseAction.extend({ action: z.literal('START_INSPECTION'), payload: z.object({}).strict().default({}) }),
  baseAction.extend({
    action: z.literal('CANCEL_BOOKING'),
    payload: z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
  }),
]);
export const bookingHistoryEntry = z.object({
  id: uuid,
  actorUserId: uuid,
  fromStatus: bookingStatus.nullable(),
  toStatus: bookingStatus,
  action: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export const bookingDetailOutput = bookingCreationOutput.extend({
  technicianUserId: uuid.nullable(),
  partsUserId: uuid.nullable(),
  qcClaimedBy: uuid.nullable(),
  completedAt: z.string().nullable(),
  history: z.array(bookingHistoryEntry),
});
export const bookingListItemOutput = bookingDetailOutput.omit({ history: true });
export const bookingActionRpcOutput = z.object({ booking: bookingDetailOutput, replayed: z.boolean() });
export const shopBookingListQuery = z.object({
  status: bookingStatus.optional(),
  assignee: z.enum(['all', 'mine', 'unassigned']).default('all'),
  page: z.coerce.number().int().min(1).max(99999).default(1),
}).strict();
export const shopBookingListOutput = z.object({
  items: z.array(bookingListItemOutput),
  page: z.number().int().positive(),
  pageSize: z.literal(50),
});
export const myBookingListOutput = z.array(bookingListItemOutput);
export type BookingActionInput = z.infer<typeof bookingActionInput>;
