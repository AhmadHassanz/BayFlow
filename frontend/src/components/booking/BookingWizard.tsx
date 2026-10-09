'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { AppointmentSlot, PublicService, ShopDetail } from '@/lib/api/shops';
import { getShopSlots, getShopServices } from '@/lib/api/shops';
import { BookingReadError, bookingFailure, canReviseBooking, getBookingIdentity, submitBooking, type BookingIdentity, type CreatedBooking } from '@/lib/api/booking';
import { bookingVehicle } from '@/lib/contracts/bookings';
import { bookingPayload, initialBookingValues, readDraft, writeDraft, type BookingFormValues, type PendingIntent, type SavedDraft } from '@/lib/booking/draft';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { calendarDates, appointmentDate, appointmentTime, moneyPkr } from '@/lib/format';
import { InlineError, LoadingSkeleton } from '@/components/shared/feedback';
import { BookingServices } from './BookingServices';
import { BookingAppointment } from './BookingAppointment';
import { BookingAccount } from './BookingAccount';
import { BookingReceipt } from './BookingReceipt';

export type BookingHints = { service?: string; date?: string; slot?: string; resume?: string; booking?: string };
const steps = [
  { name: 'The concern', title: 'What brings you in?', description: 'Choose a service, describe the symptoms, or do both. You do not need to know the diagnosis.' },
  { name: 'Your time', title: 'A time that works for you.', description: 'Choose a date and an available appointment. We will check your place again at confirmation.' },
  { name: 'Your vehicle', title: 'Let’s meet your car.', description: 'A few details help the workshop identify your vehicle and prepare for the visit.' },
  { name: 'Your account', title: 'Keep your visit connected.', description: 'Sign in or create a customer account. Your booking stays linked to you.' },
  { name: 'The review', title: 'One last look. Then you’re set.', description: 'Check the details before sending your request to the workshop.' },
];

function BookingForm({ shop, draft, hints, storageAvailable, onCreated }: { shop: ShopDetail; draft: SavedDraft | null; hints: BookingHints; storageAvailable: boolean; onCreated: (booking: CreatedBooking) => void }) {
  const dates = calendarDates(shop.timezone);
  const formDefaults = initialBookingValues(shop.id, draft, hints, dates);
  const form = useForm<BookingFormValues>({ defaultValues: formDefaults, shouldUnregister: false });
  const values = useWatch({ control: form.control }) as BookingFormValues;
  const [step, setStep] = useState(draft?.pending ? 4 : hints.resume ? 3 : draft?.step ?? 0);
  const [pending, setPending] = useState<PendingIntent | null>(draft?.pending ?? null);
  const [identity, setIdentity] = useState<BookingIdentity | null>(null);
  const [identityState, setIdentityState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(!storageAvailable);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<PublicService[]>(shop.services.items);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [confirmedSlot, setConfirmedSlot] = useState<AppointmentSlot | null>(null);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const storageReceipt = useRef<CreatedBooking | null>(null);
  const valuesRef = useRef(formDefaults);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const currentSlot = slots.find(slot => slot.id === values.slotId) ?? (confirmedSlot?.id === values.slotId ? confirmedSlot : null);
  const selectedServices = catalog.filter(service => values.serviceIds?.includes(service.id));
  const mergeCatalog = useCallback((incoming: PublicService[]) => {
    setCatalog(current => [...new Map([...current, ...incoming].map(service => [service.id, service])).values()]);
  }, []);

  useEffect(() => {
    const wanted = form.getValues('serviceIds');
    if (wanted.every(id => shop.services.items.some(service => service.id === id))) return;
    const controller = new AbortController();
    let active = true;
    async function recoverSelectedServices() {
      const found = new Set(shop.services.items.map(service => service.id));
      for (let page = 2; page <= Math.ceil(shop.services.total / shop.services.pageSize); page++) {
        const data = await getShopServices(shop.id, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), page);
        if (!active) return;
        mergeCatalog(data.items); data.items.forEach(service => found.add(service.id));
        if (wanted.every(id => found.has(id))) return;
      }
    }
    recoverSelectedServices().catch(() => { if (active) setError('Some selected services could not be loaded. Retry from the service list before continuing.'); });
    return () => { active = false; controller.abort(); };
  }, [shop.id, shop.services, form, mergeCatalog]);

  const persist = useCallback((nextPending: PendingIntent | null = pending, nextStep = step, receipt: CreatedBooking | null = storageReceipt.current) => {
    try {
      writeDraft(window.localStorage, { version: 1, shopId: shop.id, savedAt: Date.now(), values: form.getValues(), step: nextStep, pending: nextPending, receipt });
      setStorageError(false); return true;
    } catch { setStorageError(true); return false; }
  }, [shop.id, form, step, pending]);

  useEffect(() => {
    const timer = setTimeout(() => persist(), 250);
    return () => clearTimeout(timer);
  }, [values, persist]);
  useEffect(() => {
    const flush = () => { persist(); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persist]);
  const refreshIdentity = useCallback(async () => {
    try {
      const actor = await getBookingIdentity(AbortSignal.timeout(15000));
      setIdentity(actor); setIdentityState('ready');
    } catch { setIdentityState('error'); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getBookingIdentity(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(actor => {
      if (active) { setIdentity(actor); setIdentityState('ready'); }
    }).catch(() => { if (active) setIdentityState('error'); });
    return () => { active = false; controller.abort(); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const acceptSlots = useCallback((loaded: AppointmentSlot[]) => {
    setSlots(loaded);
    const selected = loaded.find(slot => slot.id === valuesRef.current.slotId && slot.capacityRemaining > 0);
    if (selected) setConfirmedSlot(selected);
  }, []);

  useEffect(() => {
    if (!values.slotId || !values.date) return;
    const controller = new AbortController();
    let active = true;
    getShopSlots(shop.id, values.date, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(loaded => {
      if (!active) return;
      const selected = loaded.find(slot => slot.id === values.slotId);
      if (selected) setConfirmedSlot(selected);
    }).catch(() => { /* Appointment selection/review performs explicit reads before submission. */ });
    return () => { active = false; controller.abort(); };
  }, [shop.id, values.date, values.slotId]);

  async function nextStep() {
    setError('');
    if (step === 0) {
      const notes = form.getValues('symptomNotes').trim();
      const ids = form.getValues('serviceIds');
      if (!ids.length && (notes.length < 10 || (notes.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 5)) { setError('Select a service or describe your symptoms in at least 10 characters.'); return; }
      if (ids.some(id => !catalog.some(service => service.id === id))) { setError('Load the selected service from the catalog or clear unavailable selections before continuing.'); return; }
    }
    if (step === 1) {
      const selected = slots.find(slot => slot.id === form.getValues('slotId') && slot.capacityRemaining > 0);
      if (!selected) { setError('Choose an available appointment time to continue.'); return; }
      setConfirmedSlot(selected);
    }
    if (step === 2) {
      const fields = form.getValues();
      const vehicle = bookingVehicle.safeParse({ registrationPlate: fields.registrationPlate, make: fields.make, model: fields.model,
        year: /^\d{4}$/.test(fields.year) ? Number(fields.year) : NaN, color: fields.color.trim() || null,
        mileageKm: fields.mileageKm.trim() === '' ? null : /^\d+$/.test(fields.mileageKm) ? Number(fields.mileageKm) : NaN });
      form.clearErrors();
      if (!vehicle.success) {
        const messages: Record<string, string> = { registrationPlate: 'Enter a registration plate of 2–20 letters, numbers, spaces or hyphens.', make: 'Enter the vehicle make.', model: 'Enter the vehicle model.', year: 'Enter a four-digit year from 1886 to 9999.', color: 'Enter a colour of up to 40 characters, or leave it blank.', mileageKm: 'Use a whole number from 0 to 2,147,483,647, or leave it blank.' };
        for (const issue of vehicle.error.issues) {
          const field = String(issue.path[0]) as keyof BookingFormValues;
          form.setError(field, { type: 'validate', message: messages[field] });
        }
        form.setFocus(String(vehicle.error.issues[0].path[0]) as keyof BookingFormValues);
        setError('Check the highlighted vehicle details.'); return;
      }
    }
    if (step === 3) {
      if (identityState !== 'ready' || !identity) { setError('Sign in to your customer account before reviewing your booking.'); return; }
      if (identity.memberships.length) { setError('Shop team accounts cannot create customer bookings. Sign in with a customer account.'); return; }
    }
    persist(pending, step + 1); setStep(value => Math.min(4, value + 1));
  }

  async function confirmBooking() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    let intent = pending;
    try {
      const actor = await getBookingIdentity(AbortSignal.timeout(15000));
      setIdentity(actor); setIdentityState('ready');
      if (!actor) { setError('Sign in again to confirm your booking.'); setStep(3); return; }
      if (!intent && identity && identity.user.id !== actor.user.id) { setError('Your signed-in account changed. Review the account before confirming.'); setStep(3); return; }
      if (intent && intent.actorId !== actor.user.id) { setError('This pending request belongs to a different account. Sign in with the original account to safely retry it.'); setStep(3); return; }
      if (!intent && actor.memberships.length) { setError('Use a customer account to book a visit.'); setStep(3); return; }
      if (!intent) {
        const fields = form.getValues();
        const currentDates = calendarDates(shop.timezone);
        if (!currentDates.includes(fields.date)) {
          form.setValue('date', currentDates[0]); form.setValue('slotId', ''); setConfirmedSlot(null);
          setError('Your selected date has passed. Choose a new appointment before confirming.'); setStep(1); return;
        }
        // Read availability again immediately before the mutation. SQL still owns
        // the atomic capacity check; this read is only customer-facing guidance.
        const fresh = await getShopSlots(shop.id, fields.date, AbortSignal.timeout(15000));
        const slot = fresh.find(slot => slot.id === fields.slotId && slot.capacityRemaining > 0 && new Date(slot.startsAt).getTime() > Date.now());
        if (!slot) { form.setValue('slotId', ''); setConfirmedSlot(null); setError('That appointment is no longer available. Please choose another time.'); setStep(1); return; }
        const payload = bookingPayload(shop.id, fields, crypto.randomUUID());
        intent = { actorId: actor.user.id, payload };
        if (!persist(intent, 4)) { setError('Allow site storage before confirming. We need to save your request key so a reload or retry cannot duplicate your booking.'); return; }
        setPending(intent);
      }
      const booking = await submitBooking(intent.payload, AbortSignal.timeout(20000));
      storageReceipt.current = booking;
      // Even if post-success storage fails, the live authoritative result wins.
      persist(null, 4, booking); setPending(null); onCreated(booking);
    } catch (caught) {
      if (intent && canReviseBooking(caught)) {
        setPending(null); persist(null, 4);
        if (caught instanceof BookingReadError && caught.code === 'SLOT_CONFLICT') { form.setValue('slotId', ''); setConfirmedSlot(null); setStep(1); }
        else if (caught instanceof BookingReadError && caught.code === 'VEHICLE_CONFLICT') setStep(2);
        else setStep(0);
      }
      if (caught instanceof BookingReadError && caught.status === 401) { setIdentity(null); setStep(3); }
      setError(caught instanceof z.ZodError ? 'Check your service, appointment and vehicle details before confirming.'
        : !intent ? 'We could not check your account or appointment availability. Please check your connection and retry.' : bookingFailure(caught));
    } finally { lock.current = false; setBusy(false); }
  }

  function editStep(index: number) {
    if (busy || (pending && index !== 3)) return;
    persist(pending, index); setError(''); setStep(index);
  }
  function resetDraft() {
    if (busy || pending) return;
    form.reset({ ...formDefaults, serviceIds: [], symptomNotes: '', notSure: false, slotId: '', registrationPlate: '', make: '', model: '', year: '', color: '', mileageKm: '' });
    setStep(0); setError(''); setConfirmedSlot(null);
  }
  const vehicleFields = [
    { name: 'registrationPlate', label: 'Registration plate', placeholder: 'e.g. LEA-1234', max: 20, auto: 'off', required: true },
    { name: 'make', label: 'Make', placeholder: 'e.g. Honda', max: 80, auto: 'off', required: true },
    { name: 'model', label: 'Model', placeholder: 'e.g. Civic', max: 80, auto: 'off', required: true },
    { name: 'year', label: 'Year', placeholder: 'e.g. 2016', max: 4, auto: 'off', required: true },
    { name: 'color', label: 'Colour', placeholder: 'Optional', max: 40, auto: 'off', required: false },
    { name: 'mileageKm', label: 'Mileage (km)', placeholder: 'Optional', max: 10, auto: 'off', required: false },
  ] as const;
  return <div className="booking-layout">
    <div className="booking-workspace"><nav className="booking-progress" aria-label="Booking progress"><ol>{steps.map((item, index) => <li className={index === step ? 'current-step' : index < step ? 'completed-step' : ''} key={item.name}><button type="button" disabled={index > step || busy || !!pending} onClick={() => editStep(index)} aria-current={step === index ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong></button></li>)}</ol></nav><p className="mobile-progress">Step {step + 1} of 5 · {steps[step].name}</p>
      <div className="booking-step-heading"><p className="eyebrow"><span>{String(step + 1).padStart(2, '0')}</span> / Your workshop visit</p><h2 tabIndex={-1} ref={heading}>{steps[step].title}</h2><p>{steps[step].description}</p></div>
      {storageError && <p className="form-error" role="alert">Your draft cannot be saved on this device. Allow site storage to preserve your progress and confirm safely.</p>}
      {pending && <div className="confirmation-note" role="status">A booking request is awaiting verification. Your details are locked so retrying checks the same request without creating another visit.</div>}
      <div className="booking-step-body">
        {step === 0 && <BookingServices shop={shop} form={form} selected={values.serviceIds ?? []} catalog={catalog} onCatalog={mergeCatalog} />}
        {step === 1 && <BookingAppointment shop={shop} form={form} date={values.date} slotId={values.slotId} onLoaded={acceptSlots} onSelect={slot => { form.setValue('slotId', slot.id, { shouldDirty: true }); setConfirmedSlot(slot); }} />}
        {step === 2 && <fieldset className="form-fieldset vehicle-fields" disabled={busy}><legend className="sr-only">Vehicle details</legend>{vehicleFields.map(field => <div className="field" key={field.name}><label htmlFor={`vehicle-${field.name}`}>{field.label} {field.required && <span aria-hidden="true">*</span>}</label><input id={`vehicle-${field.name}`} placeholder={field.placeholder} maxLength={field.max} autoComplete={field.auto} inputMode={['year', 'mileageKm'].includes(field.name) ? 'numeric' : 'text'} aria-invalid={!!form.formState.errors[field.name]} aria-describedby={form.formState.errors[field.name] ? `${field.name}-error` : undefined} {...form.register(field.name)} />{form.formState.errors[field.name] && <p id={`${field.name}-error`} className="field-error">{form.formState.errors[field.name]?.message}</p>}</div>)}<p className="fine-print vehicle-help">Fields marked * are required. Use the same vehicle details as a previous booking for this registration plate.</p></fieldset>}
        {step === 3 && <>{identityState === 'loading' ? <LoadingSkeleton label="Checking your account…" /> : identityState === 'error' ? <InlineError message="We could not verify your session. Retry before continuing." onRetry={refreshIdentity} /> : <BookingAccount identity={identity} onAuthenticated={refreshIdentity} beforeAuth={() => persist(pending, 3)} returnTo={`/book/${shop.id}?resume=1`} />}{identity?.memberships.length ? <p className="form-error" role="alert">You are signed in with a shop team account. Switch to a customer account to arrange a visit.</p> : null}</>}
        {step === 4 && <div className="booking-review"><ReviewBlock title="The concern" onEdit={() => editStep(0)} locked={!!pending || busy}><p>{selectedServices.length ? selectedServices.map(service => service.name).join(', ') : 'Symptom-based visit'}</p>{values.symptomNotes && <p className="review-notes">{values.symptomNotes}</p>}</ReviewBlock><ReviewBlock title="Your appointment" onEdit={() => editStep(1)} locked={!!pending || busy}><p>{currentSlot ? `${appointmentDate(currentSlot.startsAt, shop.timezone)} · ${appointmentTime(currentSlot.startsAt, shop.timezone)}` : values.date ? `${values.date} · selected appointment` : 'No appointment selected'}</p><span className="fine-print">{shop.timezone} · {shop.address}</span></ReviewBlock><ReviewBlock title="Your vehicle" onEdit={() => editStep(2)} locked={!!pending || busy}><p>{values.make} {values.model} · {values.year}</p><span className="plate-label">{values.registrationPlate.toUpperCase()}</span><p className="fine-print">{values.color || 'Colour not provided'} · {values.mileageKm ? `${values.mileageKm} km` : 'Mileage not provided'}</p></ReviewBlock><ReviewBlock title="Your account" onEdit={() => editStep(3)} locked={busy}><p>{identity?.user.fullName || 'Session will be verified on confirmation'}</p><span className="fine-print">{identity?.user.email}</span></ReviewBlock><p className="fine-print">This is an appointment request, not approval for repair work. The workshop inspects your vehicle before preparing an estimate.</p></div>}
      </div>
      {error && <p className="form-error booking-error" role="alert">{error}</p>}
      <div className="booking-navigation">{step > 0 && !pending ? <button type="button" className="button button-outline" disabled={busy} onClick={() => editStep(step - 1)}>Back</button> : <span />}{step < 4 ? <button className="button" type="button" disabled={busy || (step === 3 && (!identity || identityState !== 'ready' || identity.memberships.length > 0))} onClick={nextStep}>Continue <span aria-hidden="true">→</span></button> : <button className="button" type="button" disabled={busy} onClick={confirmBooking}>{busy ? 'Confirming your visit…' : pending ? 'Safely retry this booking' : 'Confirm booking'}<span aria-hidden="true">↗</span></button>}</div>
    </div>
    <aside className="booking-summary" aria-label="Your visit summary"><p className="eyebrow">Your visit, at a glance</p><h3>{shop.name}</h3><p className="summary-city">{shop.city}</p><dl><div><dt>On the service desk</dt><dd>{selectedServices.length ? selectedServices.map(service => <span key={service.id}>{service.name}</span>) : values.symptomNotes ? 'Describe symptoms' : 'Choose services or describe symptoms'}</dd></div><div><dt>Appointment</dt><dd>{currentSlot ? <>{appointmentDate(currentSlot.startsAt, shop.timezone)}<br />{appointmentTime(currentSlot.startsAt, shop.timezone)}</> : 'Choose your date and time'}<small>{shop.timezone}</small></dd></div><div><dt>Vehicle</dt><dd>{values.registrationPlate ? values.registrationPlate.toUpperCase() : 'Add your vehicle'}{values.make && <small>{values.make} {values.model}</small>}</dd></div></dl>{selectedServices.length > 0 && <div className="summary-price"><span>Listed service guide</span><strong>{selectedServices.some(service => service.basePricePkr === null) ? 'Price after inspection' : moneyPkr(selectedServices.reduce((sum, service) => sum + (service.basePricePkr ?? 0), 0))}</strong><p>Guide prices only. Your final estimate follows inspection and needs your approval.</p></div>}<div className="summary-footer"><p>Your draft is saved on this device, including vehicle details and symptoms. Account passwords are never stored in the draft.</p><button type="button" className="text-button" disabled={busy || !!pending} onClick={resetDraft}>Clear this draft</button></div></aside>
  </div>;
}

function ReviewBlock({ title, children, onEdit, locked }: { title: string; children: React.ReactNode; onEdit: () => void; locked: boolean }) {
  return <section className="review-block"><div className="review-block-heading"><h3>{title}</h3><button type="button" className="text-button" aria-label={`Edit ${title.toLowerCase()}`} disabled={locked} onClick={onEdit}>Edit</button></div>{children}</section>;
}

export function BookingWizard({ shop, hints = {} }: { shop: ShopDetail; hints?: BookingHints }) {
  const router = useRouter();
  const [bookingId, setBookingId] = useState<string | null>(hints.booking && z.uuid().safeParse(hints.booking).success ? hints.booking : null);
  const [generation, setGeneration] = useState(0);
  const restore = useCallback(async () => {
    try { return { draft: readDraft(window.localStorage, shop.id), available: true }; }
    catch { return { draft: null, available: false }; }
  }, [shop.id]);
  const { state } = useRemoteResource(restore);
  function created(booking: CreatedBooking) {
    setBookingId(booking.id); router.replace(`/book/${shop.id}?booking=${booking.id}`);
  }
  if (state.kind !== 'success') return <LoadingSkeleton label="Preparing your saved booking…" />;
  const receiptId = bookingId ?? (generation === 0 ? state.data.draft?.receipt?.id : null);
  if (receiptId) return <BookingReceipt shop={shop} bookingId={receiptId} onNew={() => { setBookingId(null); setGeneration(value => value + 1); router.replace(`/book/${shop.id}`); }} />;
  return <BookingForm key={generation} shop={shop} hints={generation ? {} : hints} draft={generation ? null : state.data.draft} storageAvailable={state.data.available} onCreated={created} />;
}
