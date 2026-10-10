import { expect, it } from 'vitest';
import { qcCanDecide, qcContextMatches, qcDecisionPayload, type QcCheck } from '@/lib/booking/qc-workbench';
import { partsBooking } from './parts-desk-fixtures';
import { estimateId, estimateTime, estimateBooking, estimateShop, estimatePart } from './estimate-fixtures';
const passed: QcCheck[] = [{ key: 'one', name: ' Road test ', result: 'PASS' }];
it('records explicit user-named checks as booleans and requires written failure details', () => {
  expect(qcDecisionPayload(passed, ' Checked ', 'PASS')).toEqual({ checklist: { 'Road test': true }, notes: 'Checked' });
  expect(qcDecisionPayload([{ ...passed[0], result: 'FAIL' }], '', 'FAIL', ' Leak ', ' Leak remains after warm-up '))
    .toEqual({ checklist: { 'Road test': false }, notes: '', title: 'Leak', description: 'Leak remains after warm-up' });
  expect(() => qcDecisionPayload(passed, '', 'FAIL')).toThrow(/written issue/);
});
it('rejects unrecorded/duplicate checks and never defaults a check to passed', () => {
  for (const checks of [[], [{ ...passed[0], result: '' as const }], [{ ...passed[0], name: '' }],
    [passed[0], { ...passed[0], name: 'road test' }], Array.from({ length: 51 }, () => passed[0])])
    expect(() => qcDecisionPayload(checks, '', 'PASS')).toThrow();
  expect(() => qcDecisionPayload([{ ...passed[0], result: 'FAIL' }], '', 'PASS')).toThrow(/must pass/);
});
it('enforces title, description, name and notes bounds without new backend fields', () => {
  expect(() => qcDecisionPayload(passed, 'a'.repeat(2001), 'PASS')).toThrow();
  expect(() => qcDecisionPayload([{ ...passed[0], name: 'a'.repeat(81) }], '', 'PASS')).toThrow();
  expect(() => qcDecisionPayload(passed, '', 'FAIL', 'a'.repeat(201), 'Issue')).toThrow();
  expect(() => qcDecisionPayload(passed, '', 'FAIL', 'Issue', 'a'.repeat(2001))).toThrow();
});
it('allows decisions only to the exact claimant with one matching open QC run', () => {
  const run = { id: estimateId, bookingId: estimateBooking, shopId: estimateShop, inspectorUserId: estimatePart,
    startedAt: estimateTime, finishedAt: null, passed: null, checklist: {}, notes: '', createdAt: estimateTime, updatedAt: estimateTime };
  const booking = { ...partsBooking, status: 'QC_IN_PROGRESS' as const, qcClaimedBy: estimatePart, qcRuns: [run] };
  expect(qcCanDecide(booking, estimatePart)).toBe(true);
  expect(qcCanDecide(booking, estimateId)).toBe(false);
  expect(qcCanDecide({ ...booking, status: 'QC_PENDING' }, estimatePart)).toBe(false);
  expect(qcCanDecide({ ...booking, qcRuns: [{ ...run, inspectorUserId: estimateId }] }, estimatePart)).toBe(false);
  expect(qcCanDecide({ ...booking, qcRuns: [run, { ...run, id: estimatePart }] }, estimatePart)).toBe(false);
  expect(qcContextMatches({ ...booking, qcRuns: [{ ...run, shopId: estimatePart }] })).toBe(false);
});
