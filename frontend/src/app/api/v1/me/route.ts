import { requireIdentity, syncProfile } from '@/lib/auth/session';
import { success, failure, databaseError } from '@/lib/api/response';

export async function GET() {
  try {
    const { client, user } = await requireIdentity();
    const profile = await syncProfile(client);
    const { data, error } = await client.from('shop_memberships')
      .select('id, shop_id, user_id, role, active').eq('user_id', user.id).eq('active', true).order('shop_id');
    if (error) databaseError(error);
    return success({ user: { ...profile, email: user.email ?? null }, memberships: (data ?? []).map(row => ({
      id: row.id, shopId: row.shop_id, userId: row.user_id, role: row.role, active: row.active,
    })) });
  } catch (error) { return failure(error); }
}
