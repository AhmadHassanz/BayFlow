import { createStaffInput, uuid } from '@/lib/contracts/auth';
import { jsonBody, requireSameOrigin, success, failure } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';
import { createStaff } from '@/server/services/team';
import { limitStaffCreation } from '@/server/permissions/rate-limit';
import { listOwnerTeam } from '@/server/services/owner';
import { teamReadQuery } from '@/lib/contracts/advisor';
import { requireAdvisor } from '@/server/permissions/advisor';
import { listTechnicians, listPartsMembers } from '@/server/services/advisor';
import { queryObject } from '@/lib/contracts/shops';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid.parse((await params).id);
    const { page, scope } = teamReadQuery.parse(queryObject(request));
    if (scope === 'technicians' || scope === 'parts') {
      const { client } = await requireAdvisor(id);
      return success(await (scope === 'parts' ? listPartsMembers(client, id, page) : listTechnicians(client, id, page)));
    }
    const { client } = await requireOwner(id);
    return success(await listOwnerTeam(client, id, page));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const shopId = uuid.parse((await params).id);
    const owner = await requireOwner(shopId);
    const input = createStaffInput.parse(await jsonBody(request));
    limitStaffCreation(owner.user.id);
    return success(await createStaff(owner, shopId, input), 201);
  } catch (error) { return failure(error); }
}
