import { failure, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { listMyBookings } from '@/server/services/booking-actions';

export async function GET() {
  try {
    const { client } = await requireIdentity();
    return success(await listMyBookings(client));
  } catch (error) { return failure(error); }
}
