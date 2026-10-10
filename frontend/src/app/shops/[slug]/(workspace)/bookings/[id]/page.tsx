import { notFound } from 'next/navigation';
import { uuid } from '@/lib/contracts/auth';
import { shopWorkspace } from '@/server/queries/workspace';
import { StaffShell } from '@/components/workspace/StaffShell';
import { StaffBookingRecord } from '@/components/workspace/StaffBookingRecord';

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const returnTo = `/shops/${slug}/bookings/${id}`;
  const context = await shopWorkspace(slug, returnTo);
  return <StaffShell {...context}><div className="workspace-heading"><div><p className="eyebrow">Reference {id.slice(0, 8)}</p><h1>Booking record.</h1><p>The workshop’s shared record, with access verified for your account.</p></div></div><StaffBookingRecord key={`${id}:${context.membership.id}`} id={id} shopId={slug} role={context.membership.role} actorId={context.identity.user.id} returnTo={returnTo} /></StaffShell>;
}
