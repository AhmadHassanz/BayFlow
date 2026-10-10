import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOut } from '@/components/workspace/SignOut';
import { NotificationBell } from '@/components/shared/NotificationBell';

export const metadata = { title: 'Your ledger | BayFlow' };
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  return <><a className="skip-link" href="#customer-main">Skip to your ledger</a><header className="workspace-header container"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><nav aria-label="Customer navigation"><Link href="/customer">Your ledger</Link><Link href="/#workshops">Book a visit</Link><NotificationBell /><SignOut /></nav></header><main id="customer-main" className="container customer-main"><div className="workspace-kicker"><span className="eyebrow">Customer workspace</span></div>{children}</main></>;
}
