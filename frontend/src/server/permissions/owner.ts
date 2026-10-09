import 'server-only';
import { ApiError } from '@/lib/api/response';
import { requireIdentity } from '@/lib/auth/session';

export async function requireOwner(shopId: string) {
  const context = await requireIdentity();
  const [shop, membership] = await Promise.all([
    context.client.from('shops').select('id, owner_user_id').eq('id', shopId).maybeSingle(),
    context.client.from('shop_memberships').select('id').eq('shop_id', shopId).eq('user_id', context.user.id).eq('role', 'OWNER').eq('active', true).maybeSingle(),
  ]);
  if (shop.error || membership.error) throw new ApiError(500, 'DATABASE_ERROR', 'Could not verify shop ownership.');
  if (shop.data?.owner_user_id !== context.user.id || !membership.data)
    throw new ApiError(403, 'FORBIDDEN', 'Only the shop owner can manage this team.');
  return context;
}
