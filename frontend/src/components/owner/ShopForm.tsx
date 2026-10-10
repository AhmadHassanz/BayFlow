'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createShopInput, editShopInput, shopOutput, type ShopSettings } from '@/lib/contracts/shops';
import { saveOwnerShop, ownerFailure, uncertainMutation } from '@/lib/api/owner';
import { HoursEditor } from './HoursEditor';

type Shop = z.infer<typeof shopOutput>;
export function ShopForm({ shop, section = 'create', onSaved }: { shop?: Shop; section?: 'create' | 'operations' | 'hours'; onSaved: (shop: Shop) => void }) {
  const initial: ShopSettings = { name: shop?.name ?? '', city: shop?.city ?? '', address: shop?.address ?? '', phone: shop?.phone ?? '',
    workingHours: shop?.workingHours ?? {}, timezone: shop?.timezone ?? 'Asia/Karachi', slotDurationMinutes: shop?.slotDurationMinutes ?? 60,
    slotCapacity: shop?.slotCapacity ?? 1, active: shop?.active ?? true };
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<ShopSettings>({ defaultValues: initial });
  const [hours, setHours] = useState(initial.workingHours);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  async function submit(fields: ShopSettings) {
    if (lock.current || uncertain) return;
    clearErrors(); setMessage('');
    const payload = section === 'operations' ? { name: fields.name, city: fields.city, address: fields.address, phone: fields.phone, active: fields.active }
      : section === 'hours' ? { workingHours: hours, timezone: fields.timezone, slotDurationMinutes: fields.slotDurationMinutes, slotCapacity: fields.slotCapacity }
        : { ...fields, workingHours: hours };
    const parsed = (shop ? editShopInput : createShopInput).safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ShopSettings;
        setError(key, { message: key === 'workingHours' ? 'Complete every window. Hours must be ordered, non-overlapping and within one day.' : issue.message }, { shouldFocus: key !== 'workingHours' });
      }
      setMessage('Check the marked fields before saving.'); return;
    }
    lock.current = true; setBusy(true);
    try {
      const saved = await saveOwnerShop(shop?.id ?? null, parsed.data);
      if (shop && saved.id !== shop.id) throw new Error('Unexpected shop response');
      onSaved(saved);
    } catch (error) { setMessage(ownerFailure(error)); if (!shop && uncertainMutation(error)) setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  }
  const fieldError = (key: keyof ShopSettings) => errors[key]?.message && <p className="form-error" id={`error-${key}`}>{String(errors[key]?.message)}</p>;
  return <form className="owner-form" onSubmit={event => { void handleSubmit(submit)(event); }} noValidate><fieldset className="form-fieldset" disabled={busy || uncertain}>
    {section !== 'hours' && <><div className="owner-form-grid">{(['name', 'city', 'phone'] as const).map(key => <div className="field" key={key}><label htmlFor={`shop-${key}`}>{key === 'name' ? 'Workshop name' : key === 'city' ? 'City' : 'Phone'} *</label><input id={`shop-${key}`} type={key === 'phone' ? 'tel' : 'text'} maxLength={key === 'name' ? 120 : key === 'city' ? 80 : 30} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} {...register(key)} />{fieldError(key)}</div>)}</div><div className="field"><label htmlFor="shop-address">Address *</label><input id="shop-address" maxLength={500} aria-invalid={!!errors.address} {...register('address')} />{fieldError('address')}</div><label className="owner-check"><input type="checkbox" {...register('active')} />Publish this workshop in the customer directory</label></>}
    {section !== 'operations' && <><div className="owner-form-grid"><div className="field"><label htmlFor="shop-timezone">Timezone *</label><input id="shop-timezone" aria-invalid={!!errors.timezone} {...register('timezone')} /><span className="field-hint">IANA name, for example Asia/Karachi.</span>{fieldError('timezone')}</div><div className="field"><label htmlFor="shop-duration">Appointment length (minutes) *</label><input id="shop-duration" type="number" min={15} max={240} step={1} aria-invalid={!!errors.slotDurationMinutes} {...register('slotDurationMinutes', { valueAsNumber: true })} />{fieldError('slotDurationMinutes')}</div><div className="field"><label htmlFor="shop-capacity">Bookings per appointment *</label><input id="shop-capacity" type="number" min={1} max={100} step={1} aria-invalid={!!errors.slotCapacity} {...register('slotCapacity', { valueAsNumber: true })} />{fieldError('slotCapacity')}</div></div><HoursEditor value={hours} onChange={value => { setHours(value); clearErrors('workingHours'); }} disabled={busy || uncertain} />{fieldError('workingHours')}<p className="fine-print">Saving refreshes the next 14 local calendar days of slots. Existing bookings are protected; conflicting schedule changes are rejected.</p></>}
    <button className="button" type="submit">{busy ? 'Saving…' : shop ? 'Save changes' : 'Create workshop'} <span aria-hidden="true">↗</span></button></fieldset>
    {message && <p role="alert" className="form-error">{message}</p>}{uncertain && <div className="confirmation-note"><p>The result is uncertain. Check your workshops before creating another one.</p><Link className="text-button" href="/owner">Check your workshops ↗</Link></div>}
  </form>;
}
