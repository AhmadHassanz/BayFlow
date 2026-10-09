import 'server-only';
import type { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, databaseError } from '@/lib/api/response';
import { createStaffInput, membershipOutput } from '@/lib/contracts/auth';
import type { requireOwner } from '@/server/permissions/owner';

type Context = Awaited<ReturnType<typeof requireOwner>>;
export async function createStaff(context: Context, shopId: string, input: z.infer<typeof createStaffInput>) {
  const admin = createAdminClient();
  // A distributed Auth+Postgres transaction is not possible. Keep a new identity
  // banned until its guarded membership transaction commits. Never reset an email.
  const { data, error } = await admin.auth.admin.createUser({ email: input.email, password: input.initialPassword,
    email_confirm: true, ban_duration: '876000h', user_metadata: { full_name: input.fullName },
    app_metadata: { bayflow_provisioned_by: context.user.id, bayflow_provisioned_shop: shopId } });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists')
      throw new ApiError(409, 'EMAIL_EXISTS', 'This email already has an account. Its credentials were not changed.');
    throw new ApiError(500, 'STAFF_CREATION_FAILED', 'The staff account could not be created.');
  }
  const userId = data.user.id;
  let membership;
  try {
    const result = await context.client.rpc('add_staff_membership', {
      target_shop_id: shopId, target_user_id: userId, staff_role: input.role,
    });
    if (result.error) databaseError(result.error);
    membership = membershipOutput.parse(result.data);
  } catch {
    // Confirm no profile exists before deleting: an uncertain HTTP failure may
    // follow a committed membership. FK RESTRICT is a second safety barrier.
    try {
      const check = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
      if (!check.error && !check.data) await admin.auth.admin.deleteUser(userId);
    } catch { /* Keep the new identity banned; operator can inspect/recover it. */ }
    throw new ApiError(500, 'STAFF_PROVISIONING_INCOMPLETE', 'Staff setup did not finish. Review the new account in Supabase before retrying.');
  }
  const enabled = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (enabled.error) throw new ApiError(500, 'STAFF_PROVISIONING_INCOMPLETE', 'Membership was created; account activation needs operator review.');
  return membership;
}
