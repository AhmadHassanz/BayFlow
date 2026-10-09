import { uuid } from '@/lib/contracts/auth';
import { editShopInput } from '@/lib/contracts/shops';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';
import { saveShop } from '@/server/services/shops';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = uuid.parse((await params).id);
    const { client } = await requireOwner(id);
    return success(await saveShop(client, id, editShopInput.parse(await jsonBody(request))));
  } catch (error) { return failure(error); }
}
