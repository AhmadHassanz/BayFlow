import { bookingActionInput } from '@/lib/contracts/booking-actions';
import { failure, jsonBody, requireSameOrigin, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { applyBookingAction } from '@/server/services/booking-actions';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const { client } = await requireIdentity();
    const input = bookingActionInput.parse(await jsonBody(request));
    const result = await applyBookingAction(client, uuid.parse(id).toLowerCase(), input);
    return success(result.booking, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
