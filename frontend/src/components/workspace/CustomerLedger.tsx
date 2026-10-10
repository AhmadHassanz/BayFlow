'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getCustomerBookings } from '@/lib/api/workspace';
import { useNotificationFeed } from '@/lib/use-notification-feed';
import { notificationDestination } from '@/lib/api/notifications';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { isClosed } from '@/lib/booking/status';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from './AccessFeedback';
import { StatusChip, recordDate } from './BookingRecord';

export function NotificationSummary({ customerId }: { customerId?: string }) {
  const { data, loading, error, refresh } = useNotificationFeed(customerId, true);
  return <aside className="notification-summary"><p className="eyebrow">Workshop updates</p>{loading ? <LoadingSkeleton label="Loading updates…" /> : error ? <AccessFeedback error={error} retry={refresh} returnTo="/customer" /> : data && <><h2>{data.unreadCount} unread</h2>{data.items.length ? <ul>{data.items.slice(0, 3).map(item => { const destination = notificationDestination(item, data.memberships); return <li key={item.id}><strong>{item.title}</strong><p>{item.message}</p>{destination && <Link className="text-button" href={destination}>View booking ↗</Link>}</li>; })}</ul> : <p>You’re up to date. New workshop updates will appear here.</p>}<p className="fine-print">Use the notification bell to inspect updates and mark them read.</p></>}</aside>;
}
export function CustomerLedger({ customerId }: { customerId: string }) {
  const { state, retry } = useRemoteResource(getCustomerBookings, undefined, true);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  if (state.kind === 'loading') return <LoadingSkeleton label="Loading your bookings…" />;
  if (state.kind === 'error') return <AccessFeedback error={state.error} retry={retry} returnTo="/customer" />;
  const own = state.data.filter(item => item.customerId === customerId);
  const bookings = own.filter(item => isClosed(item.status) === (tab === 'history')).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  return <section><div className="ledger-tabs" role="group" aria-label="Booking view"><button aria-pressed={tab === 'active'} onClick={() => setTab('active')}>Current visits <span>{own.filter(item => !isClosed(item.status)).length}</span></button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>Repair history <span>{own.filter(item => isClosed(item.status)).length}</span></button><button className="text-button" onClick={retry}>Refresh ↻</button></div>{bookings.length ? <ol className="booking-ledger">{bookings.map((booking, index) => <li key={booking.id}><span className="ledger-index">{String(index + 1).padStart(2, '0')}</span><div><StatusChip status={booking.status} /><h2><Link href={`/customer/bookings/${booking.id}`}>{booking.symptomNotes || 'Workshop visit'}</Link></h2><p>Recorded {recordDate(booking.createdAt)} · PKT</p><span className="reference-caption">Reference {booking.id.slice(0, 8)}</span></div><Link className="ledger-open" href={`/customer/bookings/${booking.id}`} aria-label={`Open booking ${booking.id}`}>↗</Link></li>)}</ol> : <EmptyState title={tab === 'history' ? 'Your history starts here.' : 'No visits in progress.'}>{tab === 'history' ? 'Completed and cancelled visits will stay here for your records.' : <><Link href="/#workshops">Find a workshop</Link> and arrange your next visit.</>}</EmptyState>}</section>;
}
