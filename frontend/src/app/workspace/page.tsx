import { redirect, notFound } from 'next/navigation';
import { WorkspaceChoice } from '@/components/workspace/WorkspaceChoice';
import { activeMemberships, membershipHome } from '@/lib/workspace';
import { membershipShops, workspaceIdentity } from '@/server/queries/workspace';

export default async function WorkspacePage() {
  const identity = await workspaceIdentity('/workspace');
  const memberships = activeMemberships(identity);
  if (memberships.some(membership => membership.role === 'OWNER')) redirect('/owner');
  if (memberships.length === 0) redirect('/customer');
  if (memberships.length === 1) redirect(membershipHome(memberships[0]));
  const shops = await membershipShops(identity);
  if (memberships.some(membership => !shops.some(shop => shop.id === membership.shopId))) notFound();
  return <WorkspaceChoice memberships={memberships} shops={shops} />;
}
