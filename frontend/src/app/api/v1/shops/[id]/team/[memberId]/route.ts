import { editStaffInput, membershipOutput, uuid } from '@/lib/contracts/auth';
import { jsonBody, requireSameOrigin, success, failure, databaseError } from '@/lib/api/response';
import { requireOwner } from '@/server/permissions/owner';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    requireSameOrigin(request);
    const path = await params;
    const shopId = uuid.parse(path.id);
    const memberId = uuid.parse(path.memberId);
    const { client } = await requireOwner(shopId);
    const input = editStaffInput.parse(await jsonBody(request));
    const { data, error } = await client.rpc('edit_staff_membership', {
      target_shop_id: shopId, target_member_id: memberId,
      ...(input.role === undefined ? {} : { staff_role: input.role }),
      ...(input.active === undefined ? {} : { is_active: input.active }),
    });
    if (error) databaseError(error);
    return success(membershipOutput.parse(data));
  } catch (error) { return failure(error); }
}
