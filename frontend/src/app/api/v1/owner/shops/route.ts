import { createShopInput } from '@/lib/contracts/shops';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { saveShop } from '@/server/services/shops';
import { listOwnerShops } from '@/server/services/owner';
import { ownerListQuery } from '@/lib/contracts/owner';
import { queryObject } from '@/lib/contracts/shops';

export async function GET(request: Request) {
  try {
    const { client, user } = await requireIdentity();
    const { page } = ownerListQuery.parse(queryObject(request));
    return success(await listOwnerShops(client, user.id, page));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { client } = await requireIdentity();
    const input = createShopInput.parse(await jsonBody(request));
    return success(await saveShop(client, null, input), 201);
  } catch (error) { return failure(error); }
}
