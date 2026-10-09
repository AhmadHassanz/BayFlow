import { z } from 'zod';
import { failure, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { shopBookingListQuery } from '@/lib/contracts/booking-actions';
import { uuid } from '@/lib/contracts/auth';
import { listShopBookings } from '@/server/services/booking-actions';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const shopId = uuid.parse(id).toLowerCase();
    const url = new URL(request.url);
    const allowed = new Set(['status', 'assignee', 'page']);
    for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new z.ZodError([]);
    const { client } = await requireIdentity();
    const query = shopBookingListQuery.parse(Object.fromEntries(url.searchParams));
    return success(await listShopBookings(client, { shopId, ...query }));
  } catch (error) { return failure(error); }
}
