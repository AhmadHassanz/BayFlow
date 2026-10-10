'use client';
import { useCallback, useState } from 'react';
import { getTechnicians, getPartsMembers } from '@/lib/api/job-actions';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton, EmptyState } from './feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';

export function AssignmentPicker({ shopId, returnTo, kind, select }: { shopId: string; returnTo: string; kind: 'TECHNICIAN' | 'PARTS'; select: (id: string, name: string) => void }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const technician = kind === 'TECHNICIAN';
  const load = useCallback((signal: AbortSignal) => technician ? getTechnicians(shopId, page, signal) : getPartsMembers(shopId, page, signal), [shopId, page, technician]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  const fallback = (id: string) => `${technician ? 'Technician' : 'Parts staff'} ${id.slice(0, 8)}`;
  if (state.kind === 'loading') return <LoadingSkeleton label={technician ? 'Loading active technicians…' : 'Loading active parts staff…'} />;
  if (state.kind === 'error') return <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} />;
  return <div className="action-fields">{state.data.items.length ? <>
    <label htmlFor={technician ? 'assign-technician' : 'assign-parts-member'}>{technician ? 'Active technician' : 'Active parts person'}</label>
    <select id={technician ? 'assign-technician' : 'assign-parts-member'} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{technician ? 'Choose a technician' : 'Choose a parts person'}</option>{state.data.items.map(item => <option key={item.userId} value={item.userId}>{item.fullName || fallback(item.userId)}</option>)}</select>
    <button className="button" disabled={!state.data.items.some(item => item.userId === selected)} onClick={() => { const item = state.data.items.find(item => item.userId === selected); if (item) select(item.userId, item.fullName || fallback(item.userId)); }}>{technician ? 'Assign technician' : 'Assign parts person'}</button>
  </> : <EmptyState title={technician ? 'No active technicians' : 'No active parts staff'}>The owner needs to activate an eligible {technician ? 'technician' : 'PARTS member'} in this workshop before assignment.</EmptyState>}
    <div className="queue-pagination"><button className="text-button" disabled={page === 1} onClick={() => { setSelected(''); setPage(page - 1); }}>{technician ? 'Previous technicians' : 'Previous parts staff'}</button><span>Page {page}</span><button className="text-button" disabled={page * 50 >= state.data.total} onClick={() => { setSelected(''); setPage(page + 1); }}>{technician ? 'Next technicians' : 'Next parts staff'}</button></div>
  </div>;
}
