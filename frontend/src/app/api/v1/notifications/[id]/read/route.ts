import { failure, requireSameOrigin, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { markNotificationReadInput } from '@/lib/contracts/notifications';
import { markNotificationRead } from '@/server/services/notifications';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const { client } = await requireIdentity();
    const input = markNotificationReadInput.parse({ notificationId: id });
    return success(await markNotificationRead(client, input.notificationId));
  } catch (error) { return failure(error); }
}