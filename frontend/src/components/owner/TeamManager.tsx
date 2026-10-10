'use client';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { useCallback, useRef, useState } from 'react';
import type { TeamMember } from '@/lib/contracts/owner';
import { staffRole, type Membership } from '@/lib/contracts/auth';
import { getOwnerTeam, editOwnerStaff, ownerFailure } from '@/lib/api/owner';
import { roleNames } from '@/lib/workspace';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { StaffCreate } from './StaffCreate';
import { Pagination } from './Pagination';

type Patch = { role?: Exclude<Membership['role'], 'OWNER'>; active?: boolean };
function MemberRow({ member, onChange }: { member: TeamMember; onChange: (member: TeamMember, patch: Patch) => void }) {
  const [role, setRole] = useState(member.role);
  return <tr><td><strong>{member.fullName || 'Name unavailable'}</strong><span className="reference-caption">Account {member.userId.slice(0, 8)}</span></td><td>{member.role === 'OWNER' ? <span className="role-badge">Owner</span> : <><label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.fullName || member.userId}</label><select id={`role-${member.id}`} value={role} onChange={event => setRole(staffRole.parse(event.target.value))}>{staffRole.options.map(value => <option value={value} key={value}>{roleNames[value]}</option>)}</select>{role !== member.role && role !== 'OWNER' && <button className="text-button" onClick={() => onChange(member, { role })}>Apply role</button>}</>}</td><td><span className="role-badge">{member.active ? 'Active' : 'Inactive'}</span></td><td>{member.role !== 'OWNER' && <button className="text-button" onClick={() => onChange(member, { active: !member.active })}>{member.active ? 'Deactivate' : 'Reactivate'}</button>}</td></tr>;
}
export function TeamManager({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => getOwnerTeam(shopId, page, signal), [shopId, page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  const [change, setChange] = useState<{ member: TeamMember; patch: Patch } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function apply() {
    if (!change || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const member = await editOwnerStaff(shopId, change.member.id, change.patch);
      if (member.id !== change.member.id || member.shopId !== shopId) throw new Error('Unexpected membership');
      setChange(null); setNotice('Membership updated. The team list is refreshing.'); retry();
    } catch (error) { setMessage(ownerFailure(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section><div className="settings-section-title"><p className="eyebrow">Team · One role per membership</p><h2>The people behind the work.</h2><p>Membership changes apply only to this workshop. Deactivation preserves assigned jobs and history.</p></div><StaffCreate shopId={shopId} onCreated={() => { setNotice('Staff account created.'); retry(); }} />{notice && <p className="save-notice" role="status">{notice}</p>}<div className="queue-toolbar"><p className="eyebrow">Workshop roster</p><button className="text-button" onClick={retry}>Refresh team ↻</button></div>
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading workshop team…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo={`/shops/${shopId}/settings`} /> : <>{state.data.items.length ? <ScrollableTable label="Workshop team table"><table className="queue-table team-table"><caption className="sr-only">Workshop team, including inactive memberships</caption><thead><tr><th scope="col">Staff member</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Manage</th></tr></thead><tbody>{state.data.items.filter(item => item.shopId === shopId).map(member => <MemberRow key={`${member.id}:${member.role}:${member.active}`} member={member} onChange={(member, patch) => { setMessage(''); setChange({ member, patch }); }} />)}</tbody></table></ScrollableTable> : <EmptyState title="No team records available">Refresh to check your workshop’s team.</EmptyState>}<Pagination page={page} total={state.data.total} onPage={value => { retry(); setPage(value); }} /></>}
    {change && <ConfirmDialog title={change.patch.role ? 'Change this role?' : change.patch.active ? 'Restore workshop access?' : 'Deactivate this membership?'} busy={busy} error={message} onConfirm={() => { void apply(); }} onCancel={() => setChange(null)}><p>{change.member.fullName || 'This staff member'}: {change.patch.role ? `${roleNames[change.member.role]} → ${roleNames[change.patch.role]}` : change.patch.active ? 'They will regain access to this workshop.' : 'They will lose access to this workshop. Their account and past work will remain.'}</p></ConfirmDialog>}
  </section>;
}
