'use client';
import { useCallback } from 'react';
import { getBookingReceipt, BookingReadError } from '@/lib/api/booking';
import { useRemoteResource } from '@/lib/use-remote-resource';
import type { Membership } from '@/lib/contracts/auth';
import { LoadingSkeleton } from '@/components/shared/feedback';
import { AdvisorActions } from '@/components/advisor/AdvisorActions';
import { AccessFeedback } from './AccessFeedback';
import { BookingRecordView } from './BookingRecord';
import { TechnicianActions } from '@/components/technician/TechnicianActions';
import { StatusChip } from './BookingRecord';
import { AdvisorEstimateReview } from '@/components/estimates/AdvisorEstimateReview';
import { estimatesBelongToBooking } from '@/lib/booking/estimate-review';
import { PartsActions } from '@/components/inventory/PartsActions';
import { QcActions } from '@/components/qc/QcActions';
import { ReadyPickupActions } from '@/components/qc/ReadyPickupActions';
import { qcContextMatches } from '@/lib/booking/qc-workbench';

export function StaffBookingRecord({ id, shopId, role, actorId, returnTo }: { id: string; shopId: string; role: Membership['role']; actorId?: string; returnTo: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await getBookingReceipt(id, signal);
    if (data.id !== id || data.shopId !== shopId || (role === 'TECHNICIAN' && data.technicianUserId !== actorId) || (role === 'PARTS' && data.partsUserId !== actorId) ||
      (role === 'QC' && (data.status === 'QC_PENDING' ? data.qcClaimedBy !== null : data.status !== 'QC_IN_PROGRESS' || data.qcClaimedBy !== actorId)) ||
      !estimatesBelongToBooking(data) || !qcContextMatches(data)) throw new BookingReadError(404, 'NOT_FOUND');
    return data;
  }, [id, shopId, role, actorId]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  return <>
    {role === 'QC' && actorId && <QcActions booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} actorId={actorId} returnTo={returnTo} refresh={retry} />}
    {(role === 'OWNER' || role === 'SA') && <ReadyPickupActions booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} role={role} returnTo={returnTo} refresh={retry} />}
    {role === 'PARTS' && actorId && <PartsActions booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} actorId={actorId} returnTo={returnTo} refresh={retry} />}
    {(role === 'OWNER' || role === 'SA') && <AdvisorEstimateReview booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} role={role} returnTo={returnTo} refresh={retry} />}
    {role === 'TECHNICIAN' && state.kind === 'success' && <section className="technician-summary" aria-label="Assigned job summary"><div><p className="eyebrow">Assigned visit · {id.slice(0, 8)}</p>
      <h2>{state.data.vehicle ? `${state.data.vehicle.make} ${state.data.vehicle.model} · ${state.data.vehicle.year}` : 'Vehicle details unavailable'}</h2>
      {state.data.vehicle && <p>{state.data.vehicle.registrationPlate}{state.data.vehicle.color ? ` · ${state.data.vehicle.color}` : ''}{state.data.vehicle.mileageKm !== null ? ` · ${state.data.vehicle.mileageKm.toLocaleString('en-PK')} km` : ''}</p>}
      {state.data.customer && <p>{state.data.customer.fullName}{state.data.customer.phone ? ` · ${state.data.customer.phone}` : ''}</p>}</div><StatusChip status={state.data.status} /></section>}
    {role === 'TECHNICIAN' && state.kind === 'success' && <section className="technician-concern"><p className="eyebrow">Reported concern</p><p>{state.data.symptomNotes || 'No additional symptoms were reported.'}</p></section>}
    {role === 'TECHNICIAN' && actorId && <TechnicianActions booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} actorId={actorId} returnTo={returnTo} refresh={retry} />}
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading booking history…" /> : state.kind === 'error'
      ? <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} />
      : <BookingRecordView booking={state.data} refresh={retry} qcIssuesAlreadyShown={role === 'TECHNICIAN'} />}
    {(role === 'OWNER' || role === 'SA') && <AdvisorActions booking={state.kind === 'success' ? state.data : null}
      bookingId={id} shopId={shopId} role={role} returnTo={returnTo} refresh={retry} />}
  </>;
}
