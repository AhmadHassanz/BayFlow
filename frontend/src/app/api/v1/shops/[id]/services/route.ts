import { uuid } from '@/lib/contracts/auth';
import { createServiceInput, servicesQuery, queryObject } from '@/lib/contracts/shops';
import { success, failure, requireSameOrigin, jsonBody } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';
import { listServices, saveService } from '@/server/services/shops';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid.parse((await params).id);
    return success(await listServices(id, servicesQuery.parse(queryObject(request)).page));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = uuid.parse((await params).id);
    const { client } = await requireOwner(id);
    return success(await saveService(client, id, null, createServiceInput.parse(await jsonBody(request))), 201);
  } catch (error) { return failure(error); }
}
