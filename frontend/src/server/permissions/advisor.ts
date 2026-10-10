import 'server-only';
import { requireIdentity } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/response';

export async function requireAdvisor(shopId: string) {
  const context = await requireIdentity();
  const result = await context.client.from('shop_memberships').select('id')
    .eq('shop_id', shopId).eq('user_id', context.user.id).eq('active', true).in('role', ['OWNER', 'SA']).maybeSingle();
  if (result.error) throw new ApiError(500, 'DATABASE_ERROR', 'Could not verify workshop access.');
  if (!result.data) throw new ApiError(403, 'FORBIDDEN', 'Workshop advisor access is required.');
  return context;
}
