import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionRpc, action, apply, setup } from './parts-fixtures.mjs';
import { asUser, expectSqlState, user, withDatabase } from './helpers.mjs';

async function repairReady(db) {
  const f = await setup(db, { stock: 5 });
  await apply(db, 13, action(f.bookingId, 'MARK_PARTS_READY', 7));
  await apply(db, 13, action(f.bookingId, 'ALLOCATE_PARTS', 8));
  return f;
}

async function bookingShop(db, bookingId) {
  await db.query('reset role');
  return (await db.query('select shop_id::text as shop from public.bookings where id=$1', [bookingId])).rows[0].shop;
}

test('B09 technician sends repair to QC, first QC claimant wins and pass enables pickup completion', () => withDatabase(async db => {
  const f = await repairReady(db);
  let result = await apply(db, 12, action(f.bookingId, 'COMPLETE_REPAIR', 9, { notes: 'Replaced belt and checked road test.' }));
  assert.equal(result.booking.status, 'QC_PENDING');
  assert.equal(result.booking.stateVersion, 10);
  assert.equal(result.booking.qcClaimedBy, null);

  result = await apply(db, 14, action(f.bookingId, 'CLAIM_QC', 10));
  assert.equal(result.booking.status, 'QC_IN_PROGRESS');
  assert.equal(result.booking.qcClaimedBy, user(14));
  assert.equal(result.booking.qcRuns.length, 1);
  assert.equal(result.booking.qcRuns[0].passed, null);

  await asUser(db, 24);
  await expectSqlState(db, actionRpc, [action(f.bookingId, 'CLAIM_QC', 10)], 'P0002');
  await expectSqlState(db, actionRpc, [action(f.bookingId, 'PASS_QC', 11, { checklist: { brakeTest: true } })], 'P0002');

  result = await apply(db, 14, action(f.bookingId, 'PASS_QC', 11, { checklist: { brakeTest: true }, notes: 'All checks passed.' }));
  assert.equal(result.booking.status, 'READY_FOR_PICKUP');
  assert.equal(result.booking.qcClaimedBy, null);
  await db.query('reset role');
  assert.equal((await db.query('select passed from public.qc_runs where booking_id=$1', [f.bookingId])).rows[0].passed, true);

  const notify = action(f.bookingId, 'NOTIFY_READY', 12);
  result = await apply(db, 11, notify);
  assert.equal(result.booking.status, 'READY_FOR_PICKUP');
  assert.equal(result.booking.stateVersion, 12);
  assert.equal((await apply(db, 11, notify)).replayed, true);

  result = await apply(db, 3, action(f.bookingId, 'COMPLETE_PICKUP', 12));
  assert.equal(result.booking.status, 'COMPLETED');
  assert.equal(result.booking.completedAt !== null, true);

  await asUser(db, 11);
  await expectSqlState(db, actionRpc, [action(f.bookingId, 'NOTIFY_READY', 13)], 'BF103');
  await db.query('reset role');
  const audit = (await db.query(`select
    (select count(*)::integer from public.qc_runs where booking_id=$1) runs,
    (select count(*)::integer from public.booking_history where booking_id=$1 and action='NOTIFY_READY') notices,
    (select count(*)::integer from public.notifications where booking_id=$1 and type='READY_FOR_PICKUP') ready_notices`, [f.bookingId])).rows[0];
  assert.deepEqual(audit, { runs: 1, notices: 1, ready_notices: 1 });
}));

test('B09 QC failure creates issue, technician fix resolves it and a later pass succeeds', () => withDatabase(async db => {
  const f = await repairReady(db);
  await apply(db, 12, action(f.bookingId, 'COMPLETE_REPAIR', 9, { notes: 'Initial repair completed.' }));
  await apply(db, 14, action(f.bookingId, 'CLAIM_QC', 10));
  let result = await apply(db, 14, action(f.bookingId, 'FAIL_QC', 11, {
    checklist: { leakCheck: false },
    notes: 'Leak remains after warm-up.',
    title: 'Leak still visible',
    description: 'Coolant leak appears after the engine reaches operating temperature.',
  }));
  assert.equal(result.booking.status, 'IN_REPAIR');
  await db.query('reset role');
  const failedRun = (await db.query('select passed from public.qc_runs where booking_id=$1 order by started_at, id', [f.bookingId])).rows[0];
  assert.equal(failedRun.passed, false);
  const openIssue = (await db.query('select title,resolved_at from public.qc_issues where booking_id=$1', [f.bookingId])).rows[0];
  assert.equal(openIssue.title, 'Leak still visible');
  assert.equal(openIssue.resolved_at, null);

  await asUser(db, 3);
  await expectSqlState(db, actionRpc, [action(f.bookingId, 'CANCEL_BOOKING', 12, { reason: 'Too late' })], 'BF103');

  result = await apply(db, 12, action(f.bookingId, 'COMPLETE_REPAIR', 12, { notes: 'Replaced clamp and pressure tested.' }));
  assert.equal(result.booking.status, 'QC_PENDING');
  assert.equal(result.booking.qcIssues[0].resolvedAt !== null, true);

  await apply(db, 24, action(f.bookingId, 'CLAIM_QC', 13));
  result = await apply(db, 24, action(f.bookingId, 'PASS_QC', 14, { checklist: { leakCheck: true } }));
  assert.equal(result.booking.status, 'READY_FOR_PICKUP');
  await db.query('reset role');
  const runs = (await db.query('select passed from public.qc_runs where booking_id=$1 order by started_at, id', [f.bookingId])).rows;
  assert.equal(runs.length, 2);
  assert.equal(runs.filter(row => row.passed === true).length, 1);
}));

test('B09 validates roles, payloads, queue visibility and helper grants', () => withDatabase(async db => {
  const f = await repairReady(db);
  await asUser(db, 13);
  await expectSqlState(db, actionRpc, [action(f.bookingId, 'COMPLETE_REPAIR', 9, { notes: 'Parts cannot finish repair.' })], '42501');
  await asUser(db, 12);
  for (const payload of [{}, { notes: 'no' }, { notes: 'ok', extra: true }]) {
    await expectSqlState(db, actionRpc, [action(f.bookingId, 'COMPLETE_REPAIR', 9, payload)], '22023');
  }
  const repairResult = await apply(db, 12, action(f.bookingId, 'COMPLETE_REPAIR', 9, { notes: 'Ready for inspection.' }));

  assert.match(repairResult.booking.shopId, /^[0-9a-f-]{36}$/);
  await asUser(db, 14);
  await apply(db, 14, action(f.bookingId, 'CLAIM_QC', 10));

  for (const payload of [
    { checklist: [] },
    { checklist: {}, title: 'bad', description: 'bad' },
  ]) await expectSqlState(db, actionRpc, [action(f.bookingId, 'PASS_QC', 11, payload)], '22023');
  for (const payload of [
    { checklist: {} },
    { checklist: {}, title: '', description: 'bad' },
    { checklist: {}, title: 'bad', description: '' },
  ]) await expectSqlState(db, actionRpc, [action(f.bookingId, 'FAIL_QC', 11, payload)], '22023');

  await asUser(db, 11);
  const functions = (await db.query(`select p.proname, p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE') anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') user_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname='list_qc_queue')
      or (n.nspname='private' and p.proname in ('normalize_qc_payload','qc_runs_dto','qc_issues_dto','list_qc_queue_impl'))`)).rows;
  assert.equal(functions.length, 5);
  for (const fn of functions) {
    assert.equal(fn.anon_execute, false);
    assert.equal(fn.user_execute, ['list_qc_queue', 'list_qc_queue_impl'].includes(fn.proname));
    assert.equal(fn.prosecdef, fn.proname === 'list_qc_queue_impl');
  }
}));
