import { failure, jsonBody, requireSameOrigin, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { orderPartsInput } from '@/lib/contracts/parts';
import { applyBookingAction } from '@/server/services/booking-actions';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const bookingId = uuid.parse((await context.params).id).toLowerCase();
    const { client } = await requireIdentity();
    const { expectedVersion, idempotencyKey, ...payload } = orderPartsInput.parse(await jsonBody(request));
    const result = await applyBookingAction(client, bookingId, { action: 'ORDER_PARTS', expectedVersion, idempotencyKey, payload });
    return success(result.booking, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
