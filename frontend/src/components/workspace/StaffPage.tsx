import { shopWorkspace } from '@/server/queries/workspace';
import { StaffShell } from './StaffShell';
import { StaffQueue } from './StaffQueue';
import { roleNames } from '@/lib/workspace';
import { AdvisorInbox } from '@/components/advisor/AdvisorInbox';
import { PartsDesk } from '@/components/inventory/PartsDesk';
import { QcDesk } from '@/components/qc/QcDesk';

const introductions: Record<string, { title: string; description: string }> = {
  advisor: { title: 'The workshop ledger.', description: 'A shared view of your workshop’s bookings and recorded progress.' },
  technician: { title: 'Your workbench.', description: 'The jobs assigned to you, with the latest workshop record.' },
  parts: { title: 'Parts desk.', description: 'The jobs assigned to you, from preparation through repair.' },
  qc: { title: 'Quality desk.', description: 'Unclaimed quality checks and jobs you have claimed, together in one ledger.' },
};
export async function StaffPage({ params, segment }: { params: Promise<{ slug: string }>; segment: string }) {
  const { slug } = await params;
  const context = await shopWorkspace(slug, `/shops/${slug}/${segment}`, segment);
  const copy = introductions[segment];
  return <StaffShell {...context}><div className="workspace-heading"><div><p className="eyebrow">{roleNames[context.membership.role]} workspace</p><h1>{copy.title}</h1><p>{copy.description}</p></div></div>{segment === 'advisor' ? <AdvisorInbox key={`${slug}:${context.membership.id}`} shopId={slug} role={context.membership.role} /> : segment === 'parts' ? <PartsDesk key={`${slug}:${context.membership.id}`} shopId={slug} actorId={context.identity.user.id} /> : segment === 'qc' ? <QcDesk key={`${slug}:${context.membership.id}`} shopId={slug} actorId={context.identity.user.id} /> : <StaffQueue key={`${slug}:${context.membership.id}`} shopId={slug} role={context.membership.role} actorId={context.identity.user.id} />}</StaffShell>;
}
