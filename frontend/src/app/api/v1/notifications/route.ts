import { z } from 'zod';
import { failure, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { notificationListQuery } from '@/lib/contracts/notifications';
import { listNotifications } from '@/server/services/notifications';

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    for (const key of parameters.keys()) if (!['unread', 'limit'].includes(key) || parameters.getAll(key).length !== 1) throw new z.ZodError([]);
    const query = notificationListQuery.parse(Object.fromEntries(parameters));
    const { client } = await requireIdentity();
    return success(await listNotifications(client, query));
  } catch (error) { return failure(error); }
}