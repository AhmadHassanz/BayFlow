import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeMemberships } from '@/lib/workspace';
import { uuid } from '@/lib/contracts/auth';
import { workspaceIdentity } from '@/server/queries/workspace';
import { SignOut } from '@/components/workspace/SignOut';
import { OwnerOnboarding } from '@/components/owner/OwnerOnboarding';

export const metadata = { title: 'Owner setup | BayFlow' };

export default async function OwnerOnboardingPage({ searchParams }: { searchParams?: Promise<{ shop?: string }> } = {}) {
  const identity = await workspaceIdentity('/owner/onboarding');
  const memberships = activeMemberships(identity);
  const ownerMemberships = memberships.filter(item => item.role === 'OWNER');
  if (!ownerMemberships.length && memberships.length) notFound();
  const requested = (await searchParams)?.shop;
  if (requested && !uuid.safeParse(requested).success) notFound();
  const shopId = requested ?? ownerMemberships[0]?.shopId;
  if (shopId && !ownerMemberships.some(item => item.shopId === shopId)) notFound();

  return <><header className="workspace-header container"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><nav aria-label="Owner onboarding navigation"><Link href="/owner">Your workshops</Link><Link href="/customer">Personal ledger</Link><SignOut /></nav></header><main className="container customer-main"><div className="workspace-heading"><div><p className="eyebrow">Owner setup · Resumable</p><h1>Build your workshop.</h1><p>Set up its schedule, customer services and employee accounts, then publish when every required role is ready.</p></div></div><OwnerOnboarding shopId={shopId} /></main></>;
}
