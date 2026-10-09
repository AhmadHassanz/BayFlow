import Link from 'next/link';
import { notFound } from 'next/navigation';
import { workspaceIdentity, membershipShops } from '@/server/queries/workspace';
import { activeMemberships, membershipHome, roleNames } from '@/lib/workspace';
import { SignOut } from '@/components/workspace/SignOut';
import { EmptyState } from '@/components/shared/feedback';

export const metadata = { title: 'Your workshops | BayFlow' };
export default async function OwnerPage() {
  const identity = await workspaceIdentity('/owner');
  const memberships = activeMemberships(identity);
  if (!memberships.some(item => item.role === 'OWNER')) notFound();
  const shops = await membershipShops(identity);
  return <><header className="workspace-header container"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><nav aria-label="Owner navigation"><Link href="/customer">Personal ledger</Link><SignOut /></nav></header><main className="container customer-main"><div className="workspace-heading"><div><p className="eyebrow">Owner workspace · {identity.user.fullName}</p><h1>Your workshops.</h1><p>Choose a workshop to open its ledger. Your role follows the workshop.</p></div></div>{shops.length ? <div className="owner-shop-grid">{shops.map(shop => { const membership = memberships.find(item => item.shopId === shop.id)!; return <Link className="owner-shop-card" href={membershipHome(membership)} key={shop.id}><p className="eyebrow">{shop.city}</p><h2>{shop.name}</h2><span className="role-badge">{roleNames[membership.role]}</span><span className="owner-shop-open">Open workspace <span aria-hidden="true">↗</span></span></Link>; })}</div> : <EmptyState title="No accessible workshops">Your active workshop memberships will appear here.</EmptyState>}</main></>;
}
