import type { JobRecord } from './advisor-actions';
export type QcCheck = { key: string; name: string; result: '' | 'PASS' | 'FAIL' };
export function qcContextMatches(booking: JobRecord) {
  return [...booking.qcRuns, ...booking.qcIssues].every(item => item.shopId === booking.shopId && item.bookingId === booking.id);
}
export function qcDecisionPayload(checks: QcCheck[], notes: string, outcome: 'PASS' | 'FAIL', title = '', description = '') {
  if (!checks.length || checks.length > 50 || checks.some(check => !check.name.trim() || check.name.trim().length > 80 || !check.result))
    throw new Error('Name and explicitly record the result of every check (1–50 checks; names up to 80 characters).');
  if (new Set(checks.map(check => check.name.trim().toLocaleLowerCase('en'))).size !== checks.length)
    throw new Error('Use distinct names for the recorded checks.');
  if (outcome === 'PASS' && checks.some(check => check.result !== 'PASS')) throw new Error('All recorded checks must pass before passing this QC run.');
  if (notes.trim().length > 2000) throw new Error('Use at most 2000 characters for QC notes.');
  const checklist = Object.fromEntries(checks.map(check => [check.name.trim(), check.result === 'PASS']));
  if (outcome === 'PASS') return { checklist, notes: notes.trim() };
  if (!title.trim() || title.trim().length > 200 || !description.trim() || description.trim().length > 2000)
    throw new Error('Failure requires a written issue title (1–200 characters) and description (1–2000 characters).');
  return { checklist, notes: notes.trim(), title: title.trim(), description: description.trim() };
}
export function qcCanDecide(booking: JobRecord, actorId: string) {
  return booking.status === 'QC_IN_PROGRESS' && booking.qcClaimedBy === actorId &&
    booking.qcRuns.filter(run => run.finishedAt === null).length === 1 && booking.qcRuns.some(run =>
      run.finishedAt === null && run.passed === null && run.inspectorUserId === actorId && run.shopId === booking.shopId && run.bookingId === booking.id);
}
