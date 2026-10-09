import { createStaffInput, uuid } from '@/lib/contracts/auth';
import { jsonBody, requireSameOrigin, success, failure } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';
import { createStaff } from '@/server/services/team';
import { limitStaffCreation } from '@/server/permissions/rate-limit';

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
