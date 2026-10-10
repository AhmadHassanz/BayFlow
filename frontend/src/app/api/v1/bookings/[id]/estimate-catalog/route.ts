import { requireIdentity } from '@/lib/auth/session';
import { failure, success } from '@/lib/api/response';
import { uuid } from '@/lib/contracts/auth';
import { queryObject } from '@/lib/contracts/shops';
import { estimateCatalogQuery } from '@/lib/contracts/technician';
import { listEstimateCatalog } from '@/server/services/technician';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid.parse((await context.params).id).toLowerCase();
    const { page } = estimateCatalogQuery.parse(queryObject(request));
    const { client } = await requireIdentity();
    return success(await listEstimateCatalog(client, id, page));
  } catch (error) { return failure(error); }
}
