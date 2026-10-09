import { directoryQuery, queryObject } from '@/lib/contracts/shops';
import { success, failure } from '@/lib/api/response';
import { listShops } from '@/server/services/shops';

export async function GET(request: Request) {
  try { return success(await listShops(directoryQuery.parse(queryObject(request)))); }
  catch (error) { return failure(error); }
}
