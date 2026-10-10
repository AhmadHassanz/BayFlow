import { z } from 'zod';
import { bookingStatus } from '@/lib/contracts/bookings';

export type BookingStatus = z.infer<typeof bookingStatus>;
// Descriptive next-step guidance only. Mutation permission always belongs to the backend.
export const statusInfo: Record<BookingStatus, { label: string; owner: string; next: string }> = {
  PENDING: { label: 'Awaiting confirmation', owner: 'Service advisor', next: 'The workshop will review and confirm your visit.' },
  CONFIRMED: { label: 'Visit confirmed', owner: 'Service advisor', next: 'The workshop will assign a technician.' },
  ASSIGNED: { label: 'Technician assigned', owner: 'Technician', next: 'Your technician will begin the inspection.' },
  INSPECTING: { label: 'Inspection underway', owner: 'Technician', next: 'Your technician is preparing the diagnosis and estimate.' },
  ESTIMATE_REVIEW: { label: 'Estimate under review', owner: 'Service advisor', next: 'The advisor will review the estimate before sending it to you.' },
  AWAITING_CUSTOMER: { label: 'Your decision needed', owner: 'Customer', next: 'Review the sent estimate on your personal booking record, then approve or decline the proposed work.' },
  ESTIMATE_APPROVED: { label: 'Estimate approved', owner: 'Service advisor', next: 'The advisor will arrange parts for the approved work.' },
  ESTIMATE_REJECTED: { label: 'Estimate declined', owner: 'Service advisor', next: 'The advisor will review your decision and discuss the next step.' },
  PARTS_PENDING: { label: 'Preparing parts', owner: 'Parts team', next: 'The parts team is checking availability.' },
  PARTS_ORDERED: { label: 'Parts on order', owner: 'Parts team', next: 'The parts team is waiting for and receiving your parts.' },
  PARTS_READY: { label: 'Parts ready', owner: 'Parts team', next: 'The parts team will allocate the parts to your repair.' },
  IN_REPAIR: { label: 'Repair underway', owner: 'Technician', next: 'Your technician is completing the repair.' },
  QC_PENDING: { label: 'Awaiting quality check', owner: 'Quality control', next: 'A quality inspector will claim and check the repair.' },
  QC_IN_PROGRESS: { label: 'Quality check underway', owner: 'Quality control', next: 'Your inspector is checking the completed work.' },
  READY_FOR_PICKUP: { label: 'Ready for collection', owner: 'Customer / service advisor', next: 'Arrange collection and confirm pickup with the workshop.' },
  COMPLETED: { label: 'Completed', owner: 'No further action', next: 'Your visit is complete. This record remains in your repair history.' },
  CANCELLED: { label: 'Cancelled', owner: 'No further action', next: 'This booking is closed. You can arrange a new visit whenever you need.' },
};
export function isClosed(status: BookingStatus) { return status === 'COMPLETED' || status === 'CANCELLED'; }
