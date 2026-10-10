import Link from 'next/link';
import { notFound } from 'next/navigation';
import { workspaceIdentity } from '@/server/queries/workspace';
import { activeMemberships } from '@/lib/workspace';
import { SignOut } from '@/components/workspace/SignOut';
import { OwnerOverview } from '@/components/owner/OwnerOverview';
import { NotificationBell } from '@/components/shared/NotificationBell';

export const metadata = { title: 'Your workshops | BayFlow' };
export default async function OwnerPage() {
  const identity = await workspaceIdentity('/owner');
  const memberships = activeMemberships(identity);
  if (memberships.length && !memberships.some(item => item.role === 'OWNER')) notFound();
  return <><header className="workspace-header container"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><nav aria-label="Owner navigation"><Link href="/customer">Personal ledger</Link><NotificationBell userId={identity.user.id} /><SignOut /></nav></header><main className="container customer-main"><div className="workspace-heading"><div><p className="eyebrow">Owner workspace · {identity.user.fullName}</p><h1>Your workshops.</h1><p>One clear view of each workshop. Every team and booking stays in its own ledger.</p></div><Link className="button" href="/owner/shops/new">Create workshop +</Link></div><OwnerOverview /></main></>;
}
