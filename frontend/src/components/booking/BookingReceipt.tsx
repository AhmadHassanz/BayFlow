'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { getBookingReceipt, BookingReadError, getBookingIdentity } from '@/lib/api/booking';
import type { ShopDetail } from '@/lib/api/shops';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { appointmentDate, appointmentTime } from '@/lib/format';
import { clearDraft } from '@/lib/booking/draft';
import { LoadingSkeleton, InlineError } from '@/components/shared/feedback';
import { BookingAccount } from './BookingAccount';

export function BookingReceipt({ shop, bookingId, onNew }: { shop: ShopDetail; bookingId: string; onNew: () => void }) {
  const load = useCallback((signal: AbortSignal) => getBookingReceipt(bookingId, signal), [bookingId]);
  const { state, retry } = useRemoteResource(load);
  const [clearError, setClearError] = useState('');
  if (state.kind === 'loading') return <LoadingSkeleton label="Verifying your booking…" />;
  if (state.kind === 'error') {
    if (state.error instanceof BookingReadError && state.error.status === 401) return <div className="receipt-panel"><p className="eyebrow">Your booking record</p><h1>Welcome back.</h1><p className="section-description">Sign in with the account that made this booking to view its confirmation.</p><BookingAccount identity={null} beforeAuth={() => true} returnTo={`/book/${shop.id}?booking=${bookingId}`} onAuthenticated={async () => { const identity = await getBookingIdentity(); if (identity) retry(); }} /></div>;
    const hidden = state.error instanceof BookingReadError && [403, 404].includes(state.error.status);
    return <div className="receipt-panel"><h1>{hidden ? 'Booking unavailable.' : 'Let’s check that again.'}</h1><InlineError message={hidden ? 'This booking is unavailable for your account. Check the account you used or contact the workshop.' : 'We could not load your booking. Please check your connection and retry.'} onRetry={retry} /><Link className="text-button" href={`/shops/${shop.slug}`}>Back to the workshop</Link></div>;
  }
  const booking = state.data;
  if (booking.shopId !== shop.id) return <div className="receipt-panel"><h1>A different workshop.</h1><p>This booking does not belong to this workshop.</p><Link className="text-button" href="/#workshops">Explore workshops</Link></div>;
  function newBooking() {
    try { clearDraft(window.localStorage, shop.id); onNew(); }
    catch { setClearError('Your previous draft could not be cleared. Allow site storage and retry.'); }
  }
  return <section className="receipt-panel" aria-labelledby="receipt-heading"><div className="receipt-seal" aria-hidden="true">✓</div><p className="eyebrow">Recorded with the workshop</p><h1 id="receipt-heading">Your visit is on the ledger.</h1><p className="section-description">Your booking was recorded with {shop.name}. Keep your reference below when contacting the team.</p><dl className="receipt-details"><div><dt>Booking reference</dt><dd className="booking-reference">{booking.id}</dd></div><div><dt>Current status</dt><dd><span className="status-label">{booking.status.replaceAll('_', ' ')}</span></dd></div><div><dt>Submitted</dt><dd>{appointmentDate(booking.createdAt, shop.timezone)} · {appointmentTime(booking.createdAt, shop.timezone)}</dd></div>{booking.symptomNotes && <div><dt>Your reported concern</dt><dd>{booking.symptomNotes}</dd></div>}</dl>{booking.status === 'PENDING' && <p className="confirmation-note">The workshop will review your request before confirming your visit.</p>}<div className="receipt-actions"><Link className="button" href={`/customer/bookings/${booking.id}`}>Follow your visit ↗</Link><Link className="button" href={`/shops/${shop.slug}`}>Back to the workshop <span aria-hidden="true">↗</span></Link><button type="button" className="text-button" onClick={newBooking}>Arrange another visit</button></div>{clearError && <p className="form-error" role="alert">{clearError}</p>}</section>;
}
