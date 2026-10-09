import { uuid } from '@/lib/contracts/auth';
import { editServiceInput } from '@/lib/contracts/shops';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';
import { saveService } from '@/server/services/shops';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  try {
    requireSameOrigin(request);
    const ids = await params;
    const id = uuid.parse(ids.id), serviceId = uuid.parse(ids.serviceId);
    const { client } = await requireOwner(id);
    return success(await saveService(client, id, serviceId, editServiceInput.parse(await jsonBody(request))));
  } catch (error) { return failure(error); }
}
