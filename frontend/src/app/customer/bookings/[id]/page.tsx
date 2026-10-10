import Link from 'next/link';
import { notFound } from 'next/navigation';
import { uuid } from '@/lib/contracts/auth';
import { workspaceIdentity } from '@/server/queries/workspace';
import { BookingRecord } from '@/components/workspace/BookingRecord';
export default async function CustomerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const returnTo = `/customer/bookings/${id}`;
  const identity = await workspaceIdentity(returnTo);
  return <><Link className="text-button" href="/customer">← Your ledger</Link><div className="workspace-heading"><div><p className="eyebrow">Booking {id.slice(0, 8)}</p><h1>Your visit.</h1><p>Follow your workshop’s recorded progress.</p></div></div><BookingRecord key={`${id}:${identity.user.id}`} id={id} customerId={identity.user.id} returnTo={returnTo} /></>;
}
