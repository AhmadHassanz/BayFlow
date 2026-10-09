'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { catalogMessage, getShopSlots, type PublicShop } from '@/lib/api/shops';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { calendarDates, dayLabel, appointmentTime } from '@/lib/format';
import { EmptyState, InlineError, LoadingSkeleton } from '@/components/shared/feedback';

function DayAvailability({ shop, date }: { shop: PublicShop; date: string }) {
  const load = useCallback((signal: AbortSignal) => getShopSlots(shop.id, date, signal), [shop.id, date]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  if (state.kind === 'loading') return <LoadingSkeleton label="Checking appointment availability…" />;
  if (state.kind === 'error') return <InlineError message={catalogMessage(state.error)} onRetry={retry} />;
  if (!state.data.length) return <EmptyState title="No appointments listed for this day">Choose another date or contact the workshop for availability.</EmptyState>;
  return <div className="slot-grid">{state.data.map(slot => slot.capacityRemaining > 0 ? <Link className="slot-option" key={slot.id} href={`/book/${shop.id}?date=${date}&slot=${slot.id}`}><span>{appointmentTime(slot.startsAt, shop.timezone)}</span><small>{slot.capacityRemaining} {slot.capacityRemaining === 1 ? 'place' : 'places'} available</small></Link> : <div className="slot-option slot-unavailable" key={slot.id}><span>{appointmentTime(slot.startsAt, shop.timezone)}</span><small>Fully booked</small></div>)}</div>;
}

export function SlotAvailability({ shop }: { shop: PublicShop }) {
  const dates = calendarDates(shop.timezone);
  const [date, setDate] = useState(dates[0]);
  return <section className="profile-availability" aria-labelledby="availability-heading"><p className="eyebrow"><span>03</span> / Find your time</p><h2 id="availability-heading">Make room for a better drive.</h2><p className="section-description">Appointments for the next 14 days. All times are local to {shop.timezone}.</p><div className="date-control"><label htmlFor="availability-date">Appointment date</label><select id="availability-date" value={date} onChange={event => setDate(event.target.value)}>{dates.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}</select></div><DayAvailability key={date} shop={shop} date={date} /><p className="fine-print">Availability can change. Your place is reserved only when your booking is confirmed.</p></section>;
}
