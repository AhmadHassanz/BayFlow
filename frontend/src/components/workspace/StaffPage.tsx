import { shopWorkspace } from '@/server/queries/workspace';
import { StaffShell } from './StaffShell';
import { StaffQueue } from './StaffQueue';
import { roleNames } from '@/lib/workspace';

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
  return <StaffShell {...context}><div className="workspace-heading"><div><p className="eyebrow">{roleNames[context.membership.role]} workspace</p><h1>{copy.title}</h1><p>{copy.description}</p></div></div><StaffQueue key={`${slug}:${context.membership.id}`} shopId={slug} role={context.membership.role} /></StaffShell>;
}
