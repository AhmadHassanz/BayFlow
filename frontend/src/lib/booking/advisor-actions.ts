import type { z } from 'zod';
import type { bookingDetailOutput } from '@/lib/contracts/booking-actions';
import type { Membership } from '@/lib/contracts/auth';

export type JobRecord = z.infer<typeof bookingDetailOutput>;
const cancellable = new Set(['PENDING', 'CONFIRMED', 'ASSIGNED', 'INSPECTING', 'ESTIMATE_REVIEW',
  'AWAITING_CUSTOMER', 'ESTIMATE_APPROVED', 'ESTIMATE_REJECTED', 'PARTS_PENDING', 'PARTS_ORDERED', 'PARTS_READY']);

// UI affordances follow the documented transitions. The RPC remains authoritative.
export function advisorActions(booking: JobRecord, role: Membership['role']) {
  if (role !== 'OWNER' && role !== 'SA') return [];
  const actions = [];
  if (booking.status === 'PENDING') actions.push('CONFIRM_BOOKING' as const);
  if (booking.status === 'CONFIRMED') actions.push('ASSIGN_TECHNICIAN' as const);
  if (booking.status === 'ESTIMATE_APPROVED') actions.push('ASSIGN_PARTS' as const);
  if (cancellable.has(booking.status) && !booking.history.some(event =>
    event.fromStatus === 'IN_REPAIR' || event.toStatus === 'IN_REPAIR')) actions.push('CANCEL_BOOKING' as const);
  return actions;
}
