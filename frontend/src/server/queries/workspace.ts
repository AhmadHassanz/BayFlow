import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { requireIdentity, syncProfile } from '@/lib/auth/session';
import { ApiError, databaseError } from '@/lib/api/response';
import { meOutput } from '@/lib/api/booking';
import { uuid } from '@/lib/contracts/auth';
import { shopMembership, activeMemberships, canUseWorkspace } from '@/lib/workspace';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Same verified identity and active membership projection as GET /api/v1/me.
export async function workspaceIdentity(returnTo: string) {
  let identity;
  try { identity = await requireIdentity(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    throw error;
  }
  const { client, user } = identity;
  const profile = await syncProfile(client);
  const { data, error } = await client.from('shop_memberships').select('id, shop_id, user_id, role, active')
    .eq('user_id', user.id).eq('active', true).order('shop_id');
  if (error) databaseError(error);
  return meOutput.parse({ user: { ...profile, email: user.email ?? null }, memberships: (data ?? []).map(row => ({
    id: row.id, shopId: row.shop_id, userId: row.user_id, role: row.role, active: row.active,
  })) });
}

const shopLabel = z.object({ id: uuid, name: z.string(), city: z.string(), timezone: z.string() });
export type WorkspaceShop = z.infer<typeof shopLabel>;
export async function membershipShops(identity: Awaited<ReturnType<typeof workspaceIdentity>>) {
  const ids = [...new Set(activeMemberships(identity).map(item => item.shopId))];
  if (!ids.length) return [];
  const client = await createClient();
  const { data, error } = await client.from('shops').select('id, name, city, timezone').in('id', ids).order('name');
  if (error) databaseError(error);
  return z.array(shopLabel).parse(data ?? []);
}
export async function shopWorkspace(shopId: string, returnTo: string, segment?: string) {
  if (!uuid.safeParse(shopId).success) notFound();
  const identity = await workspaceIdentity(returnTo);
  const membership = shopMembership(identity, shopId);
  if (!membership || (segment && !canUseWorkspace(membership.role, segment))) notFound();
  const shops = await membershipShops(identity);
  const shop = shops.find(item => item.id === shopId);
  if (!shop) notFound();
  return { identity, membership, shop, shops };
}
