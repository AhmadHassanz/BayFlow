'use client';
import { useCallback, useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { getShopSlots, catalogMessage, type AppointmentSlot, type PublicShop } from '@/lib/api/shops';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { calendarDates, dayLabel, appointmentTime } from '@/lib/format';
import type { BookingFormValues } from '@/lib/booking/draft';
import { EmptyState, InlineError, LoadingSkeleton } from '@/components/shared/feedback';

function AppointmentDay({ shop, date, slotId, onSelect, onLoaded }: { shop: PublicShop; date: string; slotId: string; onSelect: (slot: AppointmentSlot) => void; onLoaded: (slots: AppointmentSlot[]) => void }) {
  const load = useCallback((signal: AbortSignal) => getShopSlots(shop.id, date, signal), [shop.id, date]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  useEffect(() => { if (state.kind === 'success') onLoaded(state.data); }, [state, onLoaded]);
  if (state.kind === 'loading') return <LoadingSkeleton label="Checking available appointments…" />;
  if (state.kind === 'error') return <InlineError message={catalogMessage(state.error)} onRetry={retry} />;
  if (!state.data.length) return <EmptyState title="No appointments listed">Try another day, or contact the workshop for its next available appointment.</EmptyState>;
  return <><div className="slot-grid" role="group" aria-label="Available appointment times">{state.data.map(slot => <button type="button" className={`slot-option ${slot.capacityRemaining === 0 ? 'slot-unavailable' : ''} ${slotId === slot.id ? 'is-selected' : ''}`} aria-pressed={slotId === slot.id} disabled={slot.capacityRemaining === 0} key={slot.id} onClick={() => onSelect(slot)}><span>{appointmentTime(slot.startsAt, shop.timezone)}</span><small>{slot.capacityRemaining === 0 ? 'Fully booked' : `${slot.capacityRemaining} ${slot.capacityRemaining === 1 ? 'place' : 'places'} available`}</small></button>)}</div><button className="text-button" type="button" onClick={retry}>Refresh availability</button></>;
}

export function BookingAppointment({ shop, form, date, slotId, onLoaded, onSelect }: { shop: PublicShop; form: UseFormReturn<BookingFormValues>; date: string; slotId: string; onLoaded: (slots: AppointmentSlot[]) => void; onSelect: (slot: AppointmentSlot) => void }) {
  const dates = calendarDates(shop.timezone);
  return <><p className="timezone-note">All times are shown in <strong>{shop.timezone}</strong>.</p><div className="date-control"><label htmlFor="booking-date">Appointment date <span aria-hidden="true">*</span></label><select id="booking-date" value={date} onChange={event => { form.setValue('date', event.target.value); form.setValue('slotId', ''); }}>{dates.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}</select></div><AppointmentDay key={date} shop={shop} date={date} slotId={slotId} onLoaded={onLoaded} onSelect={onSelect} /><p className="fine-print">Selecting a time does not reserve it. We check availability again when you confirm.</p></>;
}
