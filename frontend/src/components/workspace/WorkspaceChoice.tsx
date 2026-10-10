import Link from 'next/link';
import type { Membership } from '@/lib/contracts/auth';
import type { WorkspaceShop } from '@/server/queries/workspace';
import { membershipHome, roleNames } from '@/lib/workspace';
import { SignOut } from './SignOut';

export function WorkspaceChoice({ memberships, shops }: { memberships: Membership[]; shops: WorkspaceShop[] }) {
  const shopById = new Map(shops.map(shop => [shop.id, shop]));
  return <main className="page-shell"><header className="workspace-heading"><div><p className="eyebrow">Workshop operations</p><h1>Choose your workspace.</h1><p>Your account has access to more than one workshop. Choose where you are working now.</p></div><SignOut /></header><div className="owned-workshops">{memberships.map(membership => {
    const shop = shopById.get(membership.shopId);
    if (!shop) return null;
    return <article className="surface" key={membership.id}><p className="eyebrow">{shop.city}</p><h2>{shop.name}</h2><p>{roleNames[membership.role]}</p><Link className="button" href={membershipHome(membership)}>Open {roleNames[membership.role].toLowerCase()} workspace ↗</Link></article>;
  })}</div><p className="workspace-entry"><Link href="/customer">Open your personal ledger ↗</Link></p></main>;
}
