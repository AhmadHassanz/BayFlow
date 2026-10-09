import { z } from 'zod';
import { bookingCreationOutput, bookingStatus } from './bookings';
import { uuid } from './auth';
import { orderPartsPayload, receivePartsPayload, requiredPartOutput, purchaseOrderOutput, partAllocationOutput } from './parts';

const identifier = uuid.transform(value => value.toLowerCase());
const emptyPayload = z.object({}).strict().default({});
const estimateItemInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PART'),
    partId: identifier,
    descriptionSnapshot: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive().max(999_999_999),
    unitPricePkr: z.number().int().nonnegative().max(999_999_999),
  }).strict(),
  z.object({
    kind: z.literal('LABOUR'),
    partId: z.null().optional(),
    descriptionSnapshot: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive().max(999_999_999),
    unitPricePkr: z.number().int().nonnegative().max(999_999_999),
  }).strict(),
]);
const estimatePayload = z.object({
  diagnosisNote: z.string().trim().min(3).max(4000),
  items: z.array(estimateItemInput).min(1).max(100),
}).strict();

export const bookingAction = z.enum([
  'CONFIRM_BOOKING', 'ASSIGN_TECHNICIAN', 'START_INSPECTION', 'CANCEL_BOOKING',
  'SUBMIT_ESTIMATE', 'SEND_ESTIMATE', 'APPROVE_ESTIMATE', 'REJECT_ESTIMATE', 'REVISE_ESTIMATE',
  'ASSIGN_PARTS', 'MARK_PARTS_READY', 'ORDER_PARTS', 'RECEIVE_PARTS', 'ALLOCATE_PARTS',
]);
const baseAction = z.object({
  action: bookingAction,
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: identifier,
}).strict();
export const bookingActionInput = z.discriminatedUnion('action', [
  baseAction.extend({ action: z.literal('CONFIRM_BOOKING'), payload: emptyPayload }),
  baseAction.extend({
    action: z.literal('ASSIGN_TECHNICIAN'),
    payload: z.object({ technicianUserId: identifier }).strict(),
  }),
  baseAction.extend({ action: z.literal('START_INSPECTION'), payload: emptyPayload }),
  baseAction.extend({
    action: z.literal('CANCEL_BOOKING'),
    payload: z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
  }),
  baseAction.extend({ action: z.literal('SUBMIT_ESTIMATE'), payload: estimatePayload }),
  baseAction.extend({ action: z.literal('SEND_ESTIMATE'), payload: estimatePayload }),
  baseAction.extend({ action: z.literal('APPROVE_ESTIMATE'), payload: emptyPayload }),
  baseAction.extend({
    action: z.literal('REJECT_ESTIMATE'),
    payload: z.object({ reason: z.string().trim().max(500).optional() }).strict().default({}),
  }),
  baseAction.extend({ action: z.literal('REVISE_ESTIMATE'), payload: estimatePayload }),
  baseAction.extend({ action: z.literal('ASSIGN_PARTS'), payload: z.object({ partsUserId: identifier }).strict() }),
  baseAction.extend({ action: z.literal('MARK_PARTS_READY'), payload: emptyPayload }),
  baseAction.extend({ action: z.literal('ORDER_PARTS'), payload: orderPartsPayload }),
  baseAction.extend({ action: z.literal('RECEIVE_PARTS'), payload: receivePartsPayload }),
  baseAction.extend({ action: z.literal('ALLOCATE_PARTS'), payload: emptyPayload }),
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
export const estimateItemOutput = z.object({
  id: uuid,
  kind: z.enum(['PART', 'LABOUR']),
  partId: uuid.nullable(),
  descriptionSnapshot: z.string(),
  quantity: z.number().int().positive(),
  unitPricePkr: z.number().int().nonnegative(),
  lineTotalPkr: z.number().int().nonnegative(),
});
export const estimateOutput = z.object({
  id: uuid,
  bookingId: uuid,
  shopId: uuid,
  revisionNo: z.number().int().positive(),
  state: z.enum(['DRAFT', 'REVIEW', 'SENT', 'APPROVED', 'REJECTED']),
  diagnosisNote: z.string(),
  subtotalPkr: z.number().int().nonnegative(),
  sentAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(estimateItemOutput),
});
export const bookingDetailOutput = bookingCreationOutput.extend({
  technicianUserId: uuid.nullable(),
  partsUserId: uuid.nullable(),
  qcClaimedBy: uuid.nullable(),
  completedAt: z.string().nullable(),
  estimates: z.array(estimateOutput).default([]),
  requiredParts: z.array(requiredPartOutput).default([]),
  purchaseOrders: z.array(purchaseOrderOutput).default([]),
  partAllocations: z.array(partAllocationOutput).default([]),
  history: z.array(bookingHistoryEntry),
});
export const bookingListItemOutput = bookingDetailOutput.omit({ history: true, estimates: true, requiredParts: true, purchaseOrders: true, partAllocations: true });
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
