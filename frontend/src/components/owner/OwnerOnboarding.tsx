'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOwnerServices, getOwnerShop, getOwnerTeam, ownerFailure, saveOwnerShop } from '@/lib/api/owner';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { ShopForm } from './ShopForm';
import { ServicesManager } from './ServicesManager';
import { TeamManager } from './TeamManager';

type Step = 'Workshop' | 'Services' | 'Team' | 'Launch';
const steps: Step[] = ['Workshop', 'Services', 'Team', 'Launch'];
const roleLabel = { SA: 'Service Advisor', TECHNICIAN: 'Technician', PARTS: 'Parts Person', QC: 'Quality Control' } as const;

export function OwnerOnboarding({ shopId }: { shopId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(shopId ? 'Services' : 'Workshop');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!shopId) return null;
    const [owner, services, team] = await Promise.all([
      getOwnerShop(shopId, signal), getOwnerServices(shopId, 1, signal), getOwnerTeam(shopId, 1, signal),
    ]);
    return { owner, services, team };
  }, [shopId]);
  const { state, retry } = useRemoteResource(load);
  const readiness = useMemo(() => {
    if (!shopId || state.kind !== 'success' || !state.data) return null;
    const { shop } = state.data.owner;
    const open = Object.values(shop.workingHours).some(windows => (windows?.length ?? 0) > 0);
    const service = state.data.services.items.some(item => item.shopId === shopId && item.active);
    const activeRoles = new Set(state.data.team.items.filter(item => item.shopId === shopId && item.active).map(item => item.role));
    return { shop, open, service, roles: (Object.keys(roleLabel) as (keyof typeof roleLabel)[]).map(role => ({ role, ready: activeRoles.has(role) })) };
  }, [shopId, state]);

  if (!shopId) return <section><div className="settings-section-title"><p className="eyebrow">01 · Workshop details and hours</p><h2>Create the tenant boundary.</h2><p>Your workshop starts unpublished. Add its real contact details, opening days and appointment capacity.</p></div><ShopForm onSaved={shop => { router.replace(`/owner/onboarding?shop=${shop.id}`); router.refresh(); }} /></section>;
  if (state.kind === 'loading') return <LoadingSkeleton label="Loading owner setup…" />;
  if (state.kind === 'error' || !state.data) return <AccessFeedback error={state.kind === 'error' ? state.error : new Error('Unavailable')} retry={retry} returnTo="/owner/onboarding" />;

  const publish = async () => {
    if (!readiness || busy) return;
    setBusy(true); setMessage('');
    try {
      const saved = await saveOwnerShop(shopId, { active: true });
      if (saved.id !== shopId || !saved.active) throw new Error('Unexpected workshop response');
      router.replace('/owner'); router.refresh();
    } catch (error) { setMessage(ownerFailure(error)); retry(); }
    finally { setBusy(false); }
  };

  return <section><div className="ledger-tabs settings-tabs" role="group" aria-label="Owner setup steps">{steps.map((value, index) => <button key={value} aria-pressed={step === value} onClick={() => { setStep(value); setMessage(''); }}>{index + 1}. {value}</button>)}</div>
    {step === 'Workshop' && <><div className="settings-section-title"><p className="eyebrow">01 · Workshop details and hours</p><h2>Set when customers can book.</h2><p>Save real contact details and at least one open day. The workshop stays private until launch.</p></div><ShopForm shop={state.data.owner.shop} section="operations" onSaved={() => { setMessage('Workshop details saved.'); retry(); }} /><ShopForm shop={state.data.owner.shop} section="hours" onSaved={() => { setMessage('Opening hours and capacity saved.'); retry(); }} /></>}
    {step === 'Services' && <><div className="settings-section-title"><p className="eyebrow">02 · Services and prices</p><h2>Describe what the workshop offers.</h2><p>Add at least one active service. Guide prices are optional; final estimates still require customer approval.</p></div><ServicesManager shopId={shopId} /></>}
    {step === 'Team' && <><div className="settings-section-title"><p className="eyebrow">03 · Employee accounts</p><h2>Create every operational role.</h2><p>Create at least one active Service Advisor, Technician, Parts Person and Quality Control account. Credentials are shown once.</p></div><TeamManager shopId={shopId} /></>}
    {step === 'Launch' && readiness && <div className="owner-form"><p className="eyebrow">04 · Review and launch</p><h2>{readiness.shop.name}</h2><p>The database rechecks this list when you publish. A disabled or stale browser cannot bypass it.</p><ul className="owner-services"><li><strong>Opening hours</strong><span className="role-badge">{readiness.open ? 'Ready' : 'Required'}</span></li><li><strong>Active service</strong><span className="role-badge">{readiness.service ? 'Ready' : 'Required'}</span></li>{readiness.roles.map(item => <li key={item.role}><strong>{roleLabel[item.role]}</strong><span className="role-badge">{item.ready ? 'Ready' : 'Required'}</span></li>)}</ul><div className="credential-actions"><button className="text-button" type="button" onClick={retry}>Refresh readiness ↻</button><button className="button" type="button" disabled={busy || !readiness.open || !readiness.service || readiness.roles.some(item => !item.ready)} onClick={() => { void publish(); }}>{busy ? 'Publishing…' : 'Publish workshop'}</button></div>{message && <p className="form-error" role="alert">{message}</p>}</div>}
    {step !== 'Launch' && <div className="credential-actions"><button className="text-button" onClick={retry}>Refresh setup ↻</button><button className="button button-small" onClick={() => setStep(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)])}>Continue →</button></div>}
    {message && step !== 'Launch' && <p className="save-notice" role="status">{message}</p>}
  </section>;
}
