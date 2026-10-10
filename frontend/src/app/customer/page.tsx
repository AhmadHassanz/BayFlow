import Link from 'next/link';
import { workspaceIdentity } from '@/server/queries/workspace';
import { CustomerLedger, NotificationSummary } from '@/components/workspace/CustomerLedger';
import { activeMemberships, identityHome } from '@/lib/workspace';
export default async function CustomerPage() {
  const identity = await workspaceIdentity('/customer');
  return <><div className="workspace-heading"><div><p className="eyebrow">Your vehicle’s story</p><h1>Your ledger.</h1><p>Every visit, every update. A clear view of the road ahead.</p></div><Link className="button" href="/#workshops">Arrange a visit ↗</Link></div>{activeMemberships(identity).length > 0 && <p className="workspace-entry"><Link href={identityHome(identity)}>Open your workshop workspace ↗</Link></p>}<div className="customer-grid"><CustomerLedger customerId={identity.user.id} /><NotificationSummary customerId={identity.user.id} /></div></>;
}
