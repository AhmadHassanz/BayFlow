'use client';
import { useState } from 'react';
import type { Membership } from '@/lib/contracts/auth';
import { bookingStatus } from '@/lib/contracts/bookings';
import { statusInfo } from '@/lib/booking/status';
import { StaffQueue } from '@/components/workspace/StaffQueue';

const desks = [
  { label: 'All visits', statuses: bookingStatus.options, initial: '' },
  { label: 'New jobs', statuses: ['PENDING', 'CONFIRMED', 'ASSIGNED'] as const, initial: 'PENDING' },
  { label: 'Estimate work', statuses: ['INSPECTING', 'ESTIMATE_REVIEW', 'AWAITING_CUSTOMER', 'ESTIMATE_REJECTED', 'ESTIMATE_APPROVED'] as const, initial: 'ESTIMATE_REVIEW' },
  { label: 'Pickup work', statuses: ['READY_FOR_PICKUP', 'COMPLETED'] as const, initial: 'READY_FOR_PICKUP' },
];
export function AdvisorInbox({ shopId, role }: { shopId: string; role: Membership['role'] }) {
  const [desk, setDesk] = useState(0);
  const [status, setStatus] = useState('');
  return <><div className="ledger-tabs advisor-tabs" aria-label="Advisor inbox filters">{desks.map((item, index) =>
    <button key={item.label} aria-pressed={index === desk} onClick={() => { setDesk(index); setStatus(item.initial); }}>{item.label}</button>)}</div>
    <div className="inbox-filter"><label htmlFor="inbox-status">Booking stage</label><select id="inbox-status" value={status} onChange={event => setStatus(event.target.value)}>
      {desk === 0 && <option value="">All stages</option>}{desks[desk].statuses.map(value => <option key={value} value={value}>{statusInfo[value].label}</option>)}</select>
      <p>Filter the live ledger by stage. Open a visit for its history and next action.</p></div>
    <StaffQueue key={`${shopId}:${status}`} shopId={shopId} role={role} status={status || undefined} /></>;
}
