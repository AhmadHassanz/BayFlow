import { z } from 'zod';
import { failure, jsonBody, requireSameOrigin, success } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';
import { uuid } from '@/lib/contracts/auth';
import { inventoryInput, inventoryQuery } from '@/lib/contracts/parts';
import { listInventory, saveInventoryPart } from '@/server/services/parts';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const shopId = uuid.parse((await context.params).id).toLowerCase();
    const parameters = new URL(request.url).searchParams;
    for (const key of parameters.keys()) if (key !== 'page' || parameters.getAll(key).length !== 1) throw new z.ZodError([]);
    const query = inventoryQuery.parse(Object.fromEntries(parameters));
    const { client } = await requireIdentity();
    return success(await listInventory(client, shopId, query.page));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const shopId = uuid.parse((await context.params).id).toLowerCase();
    const { client } = await requireIdentity();
    const input = inventoryInput.parse(await jsonBody(request));
    return success(await saveInventoryPart(client, shopId, input), input.id ? 200 : 201);
  } catch (error) { return failure(error); }
}
