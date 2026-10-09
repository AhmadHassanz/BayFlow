import { failure, jsonBody, requireSameOrigin, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { receivePartsInput } from '@/lib/contracts/parts';
import { applyBookingAction } from '@/server/services/booking-actions';
import { purchaseOrderBooking } from '@/server/services/parts';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const purchaseOrderId = uuid.parse((await context.params).id).toLowerCase();
    const { client } = await requireIdentity();
    const { expectedVersion, idempotencyKey, items } = receivePartsInput.parse(await jsonBody(request));
    const bookingId = await purchaseOrderBooking(client, purchaseOrderId);
    const result = await applyBookingAction(client, bookingId, {
      action: 'RECEIVE_PARTS', expectedVersion, idempotencyKey, payload: { purchaseOrderId, items },
    });
    return success(result.booking, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
