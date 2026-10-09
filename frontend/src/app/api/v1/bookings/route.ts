import { createBookingInput } from '@/lib/contracts/bookings';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { createBooking } from '@/server/services/bookings';
import { limitBookingCreation } from '@/server/permissions/booking-rate-limit';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { client, user } = await requireIdentity();
    limitBookingCreation(user.id);
    const input = createBookingInput.parse(await jsonBody(request));
    const result = await createBooking(client, input);
    return success(result.booking, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
