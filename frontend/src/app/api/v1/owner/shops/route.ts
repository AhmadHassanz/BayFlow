import { createShopInput } from '@/lib/contracts/shops';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { saveShop } from '@/server/services/shops';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { client } = await requireIdentity();
    const input = createShopInput.parse(await jsonBody(request));
    return success(await saveShop(client, null, input), 201);
  } catch (error) { return failure(error); }
}
