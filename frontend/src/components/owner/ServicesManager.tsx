'use client';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createServiceInput, serviceOutput } from '@/lib/contracts/shops';
import { getOwnerServices, saveOwnerService, ownerFailure, uncertainMutation } from '@/lib/api/owner';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { moneyPkr } from '@/lib/format';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { Pagination } from './Pagination';

type Service = z.infer<typeof serviceOutput>;
function ServiceForm({ shopId, service, onSaved, onCancel }: { shopId: string; service?: Service; onSaved: () => void; onCancel: () => void }) {
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<{ name: string; description: string; durationMinutes: number; price: string; active: boolean }>({ defaultValues: { name: service?.name ?? '', description: service?.description ?? '', durationMinutes: service?.durationMinutes ?? 60, price: service?.basePricePkr == null ? '' : String(service.basePricePkr), active: service?.active ?? true } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  async function submit(fields: { name: string; description: string; durationMinutes: number; price: string; active: boolean }) {
    if (lock.current || uncertain) return;
    clearErrors(); setMessage('');
    const parsed = createServiceInput.safeParse({ name: fields.name, description: fields.description, durationMinutes: fields.durationMinutes,
      basePricePkr: fields.price.trim() === '' ? null : Number(fields.price), active: fields.active });
    if (!parsed.success) { for (const issue of parsed.error.issues) setError((issue.path[0] === 'basePricePkr' ? 'price' : issue.path[0]) as keyof typeof fields, { message: issue.message }, { shouldFocus: true }); setMessage('Check the service fields. Prices must be whole PKR amounts.'); return; }
    lock.current = true; setBusy(true);
    try {
      const saved = await saveOwnerService(shopId, service?.id ?? null, parsed.data);
      if (saved.shopId !== shopId || (service && saved.id !== service.id)) throw new Error('Unexpected service');
      onSaved();
    } catch (error) { setMessage(ownerFailure(error)); if (!service && uncertainMutation(error)) setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className="owner-form service-editor" onSubmit={event => { void handleSubmit(submit)(event); }} noValidate><h3>{service ? 'Edit service' : 'Add a service'}</h3><fieldset className="form-fieldset" disabled={busy || uncertain}><div className="owner-form-grid">{(['name', 'durationMinutes', 'price'] as const).map(key => <div className="field" key={key}><label htmlFor={`service-${key}`}>{key === 'name' ? 'Service name *' : key === 'price' ? 'Guide price (whole PKR)' : 'Duration (minutes) *'}</label><input id={`service-${key}`} type={key === 'name' ? 'text' : 'number'} min={key === 'price' ? 0 : 1} step={1} aria-invalid={!!errors[key]} {...register(key, key === 'durationMinutes' ? { valueAsNumber: true } : {})} />{errors[key] && <p className="form-error">{errors[key].message}</p>}</div>)}</div><div className="field"><label htmlFor="service-description">Description</label><textarea id="service-description" rows={3} maxLength={2000} {...register('description')} /></div><p className="field-hint">Leave price blank for “Price on assessment”. These are guide prices, not final estimates.</p><label className="owner-check"><input type="checkbox" {...register('active')} />Offer this service in the customer catalog</label><button className="button" type="submit">{busy ? 'Saving…' : 'Save service'}</button></fieldset><button className="text-button" type="button" disabled={busy} onClick={onCancel}>{uncertain ? 'Close and check catalog' : 'Cancel editing'}</button>{message && <p className="form-error" role="alert">{message}</p>}{uncertain && <p className="confirmation-note">Check the catalog before adding another service; the earlier request may have succeeded.</p>}</form>;
}
export function ServicesManager({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => getOwnerServices(shopId, page, signal), [shopId, page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  const [editor, setEditor] = useState<Service | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  return <section><div className="settings-section-title"><p className="eyebrow">Services · Your public offer</p><h2>A catalog with purpose.</h2><p>Manage guide prices and availability. Unpublished services remain here for reactivation; existing bookings keep their records.</p></div><div className="queue-toolbar"><button className="button button-small" disabled={!!editor} onClick={() => setEditor('new')}>Add service +</button><button className="text-button" onClick={retry}>Refresh catalog ↻</button></div>{notice && <p className="save-notice" role="status">{notice}</p>}{editor && <ServiceForm key={editor === 'new' ? 'new' : editor.id} shopId={shopId} service={editor === 'new' ? undefined : editor} onSaved={() => { setEditor(null); setNotice('Service saved. The public directory uses this updated catalog on its next fetch.'); retry(); }} onCancel={() => { setEditor(null); retry(); }} />}
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading owner service catalog…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo={`/shops/${shopId}/settings`} /> : <>{state.data.items.length ? <ul className="owner-services">{state.data.items.filter(item => item.shopId === shopId).map(service => <li key={service.id}><div><span className="role-badge">{service.active ? 'Published' : 'Unpublished'}</span><h3>{service.name}</h3><p>{service.description || 'No description provided.'}</p></div><div className="service-price"><strong>{service.basePricePkr === null ? 'Price on assessment' : moneyPkr(service.basePricePkr)}</strong><span>{service.durationMinutes} minutes</span><button className="text-button" disabled={!!editor} onClick={() => setEditor(service)} aria-label={`Edit ${service.name}`}>Edit service ↗</button></div></li>)}</ul> : <EmptyState title="Your catalog is ready to begin.">Add the services your workshop offers. Customers can also book by describing symptoms.</EmptyState>}<Pagination page={page} total={state.data.total} onPage={value => { retry(); setPage(value); }} /></>}
  </section>;
}
