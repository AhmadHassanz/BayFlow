import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { user } from './helpers.mjs';
import { action, actionRpc, apply, setup } from './parts-fixtures.mjs';

async function connect() {
  const connectionString = process.env.BAYFLOW_TEST_DB_URL;
  if (!connectionString || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('Workflow races require the disposable native loopback harness.');
  const db = new pg.Client({ connectionString });
  await db.connect();
  return db;
}

async function begin(db, actor) {
  await db.query('begin');
  await db.query('set local statement_timeout=10000');
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user(actor)]);
}

async function attempt(db, input) {
  try {
    const result = (await db.query(actionRpc, [input])).rows[0].result;
    await db.query('commit');
    return { result };
  } catch (error) {
    await db.query('rollback');
    return { code: error.code };
  }
}

async function fixture(options, callback) {
  const admin = await connect();
  const first = await connect();
  const second = await connect();
  let shopId;
  try {
    await admin.query('begin');
    const value = await setup(admin, { stock: options.stock ?? 5 });
    shopId = value.shopId;
    const prepared = await options.prepare(admin, value);
    await admin.query('commit');
    await callback({ admin, first, second, ...prepared });
  } finally {
    for (const db of [first, second]) {
      await db.query('rollback');
      await db.end();
    }
    await admin.query('rollback');
    if (shopId) await admin.query('update public.shops set active=false where id=$1', [shopId]);
    await admin.end();
  }
}

async function awaitingApproval(db, f) {
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user(3)]);
  const booking = (await db.query('select public.create_booking($1) result', [{
    shopId: f.shopId, slotId: f.slotId, serviceIds: [f.serviceId], symptomNotes: '',
    vehicle: { registrationPlate: `I03-${randomUUID().slice(0, 8)}`, make: 'Honda', model: 'City', year: 2019 },
    idempotencyKey: randomUUID(),
  }])).rows[0].result.booking;
  const estimate = { diagnosisNote: 'I03 approval race fixture.', items: [
    { kind: 'PART', partId: f.partId, descriptionSnapshot: 'I03 belt', quantity: 1, unitPricePkr: 900 },
    { kind: 'LABOUR', descriptionSnapshot: 'I03 labour', quantity: 1, unitPricePkr: 700 },
  ] };
  await apply(db, 11, action(booking.id, 'CONFIRM_BOOKING', 0));
  await apply(db, 11, action(booking.id, 'ASSIGN_TECHNICIAN', 1, { technicianUserId: user(12) }));
  await apply(db, 12, action(booking.id, 'START_INSPECTION', 2));
  await apply(db, 12, action(booking.id, 'SUBMIT_ESTIMATE', 3, estimate));
  await apply(db, 11, action(booking.id, 'SEND_ESTIMATE', 4, estimate));
  return booking.id;
}

test('I03 simultaneous double approval commits one decision/history/receipt and replays the duplicate', () =>
  fixture({ prepare: async (db, f) => ({ bookingId: await awaitingApproval(db, f) }) }, async ({ admin, first, second, bookingId }) => {
    const input = action(bookingId, 'APPROVE_ESTIMATE', 5);
    await Promise.all([begin(first, 3), begin(second, 3)]);
    const results = await Promise.all([attempt(first, input), attempt(second, input)]);
    assert.ok(results.every(item => item.result));
    assert.equal(results.filter(item => item.result.replayed).length, 1);
    const counts = (await admin.query(`select
      (select count(*)::integer from public.booking_history where booking_id=$1 and action='APPROVE_ESTIMATE') history,
      (select count(*)::integer from private.booking_action_receipts where booking_id=$1 and action='APPROVE_ESTIMATE') receipts,
      (select count(*)::integer from public.estimates where booking_id=$1 and state='APPROVED') approved`, [bookingId])).rows[0];
    assert.deepEqual(counts, { history: 1, receipts: 1, approved: 1 });
  }));

test('I03 simultaneous duplicate receipt adds stock once and records one action', () =>
  fixture({ stock: 0, prepare: async (db, f) => {
    const ordered = await apply(db, 13, action(f.bookingId, 'ORDER_PARTS', 7, { items: [{ partId: f.partId, quantity: 3 }] }));
    return { bookingId: f.bookingId, partId: f.partId, purchaseOrderId: ordered.booking.purchaseOrders[0].id };
  } }, async ({ admin, first, second, bookingId, partId, purchaseOrderId }) => {
    const input = action(bookingId, 'RECEIVE_PARTS', 8, { purchaseOrderId, items: [{ partId, quantity: 3 }] });
    await Promise.all([begin(first, 13), begin(second, 13)]);
    const results = await Promise.all([attempt(first, input), attempt(second, input)]);
    assert.ok(results.every(item => item.result));
    assert.equal(results.filter(item => item.result.replayed).length, 1);
    assert.equal((await admin.query('select quantity_on_hand from public.inventory_parts where id=$1', [partId])).rows[0].quantity_on_hand, 3);
    const counts = (await admin.query(`select
      (select count(*)::integer from public.booking_history where booking_id=$1 and action='RECEIVE_PARTS') history,
      (select count(*)::integer from private.booking_action_receipts where booking_id=$1 and action='RECEIVE_PARTS') receipts`, [bookingId])).rows[0];
    assert.deepEqual(counts, { history: 1, receipts: 1 });
  }));

test('I03 simultaneous QC claims produce exactly one claimant and one open run', () =>
  fixture({ prepare: async (db, f) => {
    await apply(db, 13, action(f.bookingId, 'MARK_PARTS_READY', 7));
    await apply(db, 13, action(f.bookingId, 'ALLOCATE_PARTS', 8));
    await apply(db, 12, action(f.bookingId, 'COMPLETE_REPAIR', 9, { notes: 'I03 repair ready for concurrent QC claim.' }));
    return { bookingId: f.bookingId };
  } }, async ({ admin, first, second, bookingId }) => {
    await Promise.all([begin(first, 14), begin(second, 24)]);
    const results = await Promise.all([
      attempt(first, action(bookingId, 'CLAIM_QC', 10)),
      attempt(second, action(bookingId, 'CLAIM_QC', 10)),
    ]);
    assert.equal(results.filter(item => item.result).length, 1);
    assert.equal(results.filter(item => ['P0002', 'BF101'].includes(item.code)).length, 1);
    const booking = (await admin.query('select status,qc_claimed_by from public.bookings where id=$1', [bookingId])).rows[0];
    assert.equal(booking.status, 'QC_IN_PROGRESS');
    assert.ok([user(14), user(24)].includes(booking.qc_claimed_by));
    assert.equal((await admin.query('select count(*)::integer n from public.qc_runs where booking_id=$1 and finished_at is null', [bookingId])).rows[0].n, 1);
  }));
