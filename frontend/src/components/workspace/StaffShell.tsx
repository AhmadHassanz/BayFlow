'use client';
import Link from 'next/link';
import { useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode, KeyboardEvent } from 'react';
import type { BookingIdentity } from '@/lib/api/booking';
import type { Membership } from '@/lib/contracts/auth';
import type { WorkspaceShop } from '@/server/queries/workspace';
import { roleNames, membershipHome, activeMemberships } from '@/lib/workspace';
import { SignOut } from './SignOut';

export function StaffShell({ identity, membership, shop, shops, children }: { identity: BookingIdentity; membership: Membership; shop: WorkspaceShop; shops: WorkspaceShop[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const available = activeMemberships(identity).filter(item => shops.some(shop => shop.id === item.shopId));
  const home = membershipHome(membership);
  function close() { setOpen(false); toggle.current?.focus(); }
  function handleKeyboard(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const elements = navigation.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select');
    if (!elements?.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (document.activeElement === toggle.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); toggle.current?.focus(); }
  }
  return <div className="staff-shell" onKeyDown={handleKeyboard}><header className="staff-mobile-header"><Link className="wordmark" href="/">BayFlow</Link><button ref={toggle} className="button button-outline button-small" aria-expanded={open} aria-controls="staff-navigation" onClick={() => setOpen(value => !value)}>{open ? 'Close menu' : 'Menu'}</button></header>{open && <button className="drawer-backdrop" aria-label="Close navigation" onClick={close} />}<aside ref={navigation} id="staff-navigation" className={`staff-sidebar${open ? ' is-open' : ''}`}><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><p className="sidebar-caption eyebrow">Workshop operations</p><div className="shop-selector"><label htmlFor="workspace-shop">Shop & role</label><select id="workspace-shop" value={membership.id} onChange={event => { const selected = available.find(item => item.id === event.target.value); if (selected) { setOpen(false); router.push(membershipHome(selected)); } }}>{available.map(item => <option key={item.id} value={item.id}>{shops.find(shop => shop.id === item.shopId)?.name} · {roleNames[item.role]}</option>)}</select></div><nav aria-label="Workshop navigation"><Link href={home} aria-current={pathname === home ? 'page' : undefined} onClick={() => setOpen(false)}><span aria-hidden="true">▤</span>{membership.role === 'OWNER' ? 'Booking ledger' : `${roleNames[membership.role]} workspace`}</Link>{membership.role === 'OWNER' && <Link href="/owner" onClick={() => setOpen(false)}><span aria-hidden="true">◫</span>Your workshops</Link>}<Link href="/customer" onClick={() => setOpen(false)}><span aria-hidden="true">↗</span>Personal ledger</Link></nav><div className="sidebar-account"><span className="role-badge">{roleNames[membership.role]}</span><strong>{identity.user.fullName}</strong><SignOut /></div></aside><div className="staff-content"><header className="shop-workspace-header"><div><p className="eyebrow">{shop.city}</p><h2>{shop.name}</h2></div><span className="role-badge">{roleNames[membership.role]}</span></header><nav className="workspace-breadcrumbs" aria-label="Breadcrumb"><Link href={home}>{shop.name}</Link><span aria-hidden="true">/</span><span>{pathname.includes('/bookings/') ? 'Booking record' : roleNames[membership.role]}</span></nav><main id="workspace-main">{children}</main></div></div>;
}
