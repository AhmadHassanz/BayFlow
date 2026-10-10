import { z } from 'zod';
import { BookingReadError } from './booking';
import { workspaceRead } from './workspace';
import { bookingActionInput, bookingDetailOutput, type BookingActionInput } from '@/lib/contracts/booking-actions';
import { technicianChoicesOutput } from '@/lib/contracts/advisor';

export const getTechnicians = (shopId: string, page: number, signal: AbortSignal) =>
  workspaceRead(`/api/v1/shops/${shopId}/team?scope=technicians&page=${page}`, technicianChoicesOutput, signal);
export const getPartsMembers = (shopId: string, page: number, signal: AbortSignal) =>
  workspaceRead(`/api/v1/shops/${shopId}/team?scope=parts&page=${page}`, technicianChoicesOutput, signal);

export async function submitJobAction(bookingId: string, shopId: string, input: BookingActionInput) {
  const body = bookingActionInput.parse(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api/v1/bookings/${bookingId}/actions`, { method: 'POST',
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      let code = 'REQUEST_FAILED';
      try { code = z.object({ error: z.object({ code: z.string() }) }).parse(await response.json()).error.code; }
      catch { /* Never display raw server or proxy bodies. */ }
      throw new BookingReadError(response.status, code);
    }
    const booking = z.object({ data: bookingDetailOutput, error: z.null() }).parse(await response.json()).data;
    if (booking.id !== bookingId || booking.shopId !== shopId) throw new Error('Unexpected booking response.');
    return booking;
  } finally { clearTimeout(timer); }
}

export function jobActionFailure(error: unknown) {
  if (!(error instanceof BookingReadError) || error.status >= 500)
    return 'The result is uncertain. Retry this same request to safely check whether it was saved.';
  if (error.status === 401) return 'Your session expired. Sign in again, then reload this record.';
  if (error.status === 403 || error.status === 404) return 'Access or assignment changed. Reload the record and check your workshop.';
  if (error.code === 'STATE_CONFLICT') return 'This booking changed while you were working. Reload the record before choosing another action.';
  if (error.code === 'STOCK_CONFLICT') return 'Required stock changed before allocation. Reload the record, inspect the shortage and receive or order the missing parts before trying again.';
  if (error.code === 'BOOKING_CONFLICT') return 'Another request is in progress. Retry this same request in a moment.';
  if (error.code === 'IDEMPOTENCY_CONFLICT') return 'This request key conflicts with an earlier intent. Reload the record before continuing.';
  if (error.status === 422) return 'This action is no longer available. Reload the record to see its current state.';
  if (error.status === 429) return 'Too many requests. Wait a minute, then retry this same request.';
  return 'Check the submitted fields. Reload the record before trying a corrected action.';
}
