'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { getOwnerShop } from '@/lib/api/owner';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { ShopForm } from './ShopForm';
import { ShopCounts } from './OwnerOverview';
import { TeamManager } from './TeamManager';
import { ServicesManager } from './ServicesManager';

export function ShopSettings({ shopId }: { shopId: string }) {
  const [tab, setTab] = useState<'Operations' | 'Team' | 'Services' | 'Hours'>('Operations');
  const [notice, setNotice] = useState('');
  const load = useCallback((signal: AbortSignal) => getOwnerShop(shopId, signal), [shopId]);
  const { state, retry } = useRemoteResource(load);
  if (state.kind === 'loading') return <LoadingSkeleton label="Loading private workshop settings…" />;
  if (state.kind === 'error') return <AccessFeedback error={state.error} retry={retry} returnTo={`/shops/${shopId}/settings`} />;
  const { shop, counts } = state.data;
  if (shop.id !== shopId) return <p className="form-error" role="alert">This workshop record is unavailable.</p>;
  return <><div className="workspace-heading"><div><p className="eyebrow">Owner control center · {shop.active ? 'Published' : 'Unpublished'}</p><h1>Your workshop,<br />in good order.</h1><p>Keep the essentials clear. Each change belongs to {shop.name}.</p></div><button className="text-button" onClick={retry}>Refresh settings ↻</button></div><div className="ledger-tabs settings-tabs" role="group" aria-label="Workshop settings sections">{(['Operations', 'Team', 'Services', 'Hours'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setNotice(''); }}>{value}</button>)}</div>{notice && <p className="save-notice" role="status">{notice}</p>}
    <div className="settings-panel">{tab === 'Operations' ? <><ShopCounts counts={counts} /><div className="settings-section-title"><p className="eyebrow">01 · Workshop essentials</p><h2>The details customers rely on.</h2><p>Publishing controls the public directory. Your bookings and private records stay with the workshop.</p></div><ShopForm key={`operations:${shop.name}:${shop.active}`} shop={shop} section="operations" onSaved={() => { setNotice('Workshop details saved.'); retry(); }} /><Link className="text-button" href={`/shops/${shopId}/advisor`}>Open the booking ledger ↗</Link></>
      : tab === 'Hours' ? <><div className="settings-section-title"><p className="eyebrow">04 · Hours & capacity</p><h2>A schedule that holds up.</h2><p>Plan your appointment windows around the team’s capacity. Existing customer bookings are protected.</p></div><ShopForm key="hours" shop={shop} section="hours" onSaved={() => { setNotice('Hours and appointment settings saved.'); retry(); }} /></>
        : tab === 'Team' ? <TeamManager key={shopId} shopId={shopId} /> : <ServicesManager key={shopId} shopId={shopId} />}</div></>;
}
