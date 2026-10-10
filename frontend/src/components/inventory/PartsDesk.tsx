'use client';
import { useState } from 'react';
import { StaffQueue } from '@/components/workspace/StaffQueue';
import { InventoryLedger } from './InventoryLedger';
export function PartsDesk({ shopId, actorId }: { shopId: string; actorId: string }) {
  const [tab, setTab] = useState<'jobs' | 'inventory'>('jobs');
  const [status, setStatus] = useState('');
  return <><div className="ledger-tabs" aria-label="Parts desk views"><button aria-pressed={tab === 'jobs'} onClick={() => setTab('jobs')}>Assigned parts jobs</button><button aria-pressed={tab === 'inventory'} onClick={() => setTab('inventory')}>Workshop inventory</button></div>
    {tab === 'inventory' ? <InventoryLedger shopId={shopId} /> : <><div className="inbox-filter"><label htmlFor="parts-job-stage">Parts job stage</label><select id="parts-job-stage" value={status} onChange={event => setStatus(event.target.value)}><option value="">All assigned stages</option><option value="PARTS_PENDING">Preparing parts</option><option value="PARTS_ORDERED">Parts on order</option><option value="PARTS_READY">Parts ready</option><option value="IN_REPAIR">Allocated to repair</option></select></div><StaffQueue key={`${shopId}:${status}`} shopId={shopId} role="PARTS" actorId={actorId} status={status || undefined} /></>}
  </>;
}
