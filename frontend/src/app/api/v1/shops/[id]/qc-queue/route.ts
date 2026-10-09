import { z } from 'zod';
import { failure, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { qcQueueQuery } from '@/lib/contracts/booking-actions';
import { listQcQueue } from '@/server/services/booking-actions';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const shopId = uuid.parse((await context.params).id).toLowerCase();
    const parameters = new URL(request.url).searchParams;
    for (const key of parameters.keys()) if (key !== 'page' || parameters.getAll(key).length !== 1) throw new z.ZodError([]);
    const query = qcQueueQuery.parse(Object.fromEntries(parameters));
    const { client } = await requireIdentity();
    return success(await listQcQueue(client, shopId, query.page));
  } catch (error) { return failure(error); }
}
