import { failure, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { getBooking } from '@/server/services/booking-actions';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { client } = await requireIdentity();
    return success(await getBooking(client, uuid.parse(id).toLowerCase()));
  } catch (error) { return failure(error); }
}
