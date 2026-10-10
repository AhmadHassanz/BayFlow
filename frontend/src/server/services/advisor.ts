import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api/response';
import { technicianChoicesOutput } from '@/lib/contracts/advisor';

export async function listTechnicians(client: Awaited<ReturnType<typeof createClient>>, shopId: string, page: number) {
  return listAssignmentMembers(client, shopId, page, 'TECHNICIAN');
}
export async function listPartsMembers(client: Awaited<ReturnType<typeof createClient>>, shopId: string, page: number) {
  return listAssignmentMembers(client, shopId, page, 'PARTS');
}
async function listAssignmentMembers(client: Awaited<ReturnType<typeof createClient>>, shopId: string, page: number, role: 'TECHNICIAN' | 'PARTS') {
  const result = await client.from('shop_memberships').select('user_id, profiles(full_name)', { count: 'exact' })
    .eq('shop_id', shopId).eq('role', role).eq('active', true)
    .order('user_id').range((page - 1) * 50, page * 50 - 1);
  if (result.error || result.count === null) throw new ApiError(500, 'DATABASE_ERROR', 'Assignment members could not be loaded.');
  return technicianChoicesOutput.parse({ items: (result.data ?? []).map(row => ({ userId: row.user_id,
    fullName: row.profiles?.full_name ?? null })), page, pageSize: 50, total: result.count });
}
