import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { asUser, expectSqlState, id, user, withDatabase } from './helpers.mjs';

const hours = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day => [day, [['09:00','18:00']]]));
const createRpc = 'select public.create_booking($1) as result';
const actionRpc = 'select public.apply_booking_action($1) as result';
const vehicle = { registrationPlate: 'B07-NEW', make: 'Toyota', model: 'Corolla', year: 2018, color: null, mileageKm: null };

async function setup(db) {
  await asUser(db, 1);
  const shopResult = await db.query('select public.save_shop(null,$1) as s', [{
    name: 'B07 Native', city: 'Lahore', address: 'Native B07 fixture', phone: '+920000000000', workingHours: hours, slotCapacity: 4,
  }]);
  const shop = shopResult.rows[0].s;
  const service = (await db.query('select public.save_service($1,null,$2) as s', [shop.id, { name: 'Inspection', durationMinutes: 60 }])).rows[0].s;
  await db.query('reset role');
  await db.query(`insert into public.shop_memberships(shop_id,user_id,role,active) values
    ($1,$2,'SA',true),($1,$3,'TECHNICIAN',true),($1,$4,'PARTS',true),($1,$5,'QC',true)`,
    [shop.id, user(11), user(12), user(13), user(14)]);
  const part = (await db.query(`insert into public.inventory_parts(shop_id,sku,name,quantity_on_hand,reorder_level,unit_cost_pkr,active)
    values($1,'ZERO-STOCK','Zero stock belt',0,0,900,true) returning id`, [shop.id])).rows[0];
  const slot = (await db.query(`select id from public.appointment_slots where shop_id=$1
    and (starts_at at time zone 'Asia/Karachi')::date=(clock_timestamp() at time zone 'Asia/Karachi')::date+1
    order by starts_at limit 1`, [shop.id])).rows[0].id;
  await asUser(db, 3);
  const booking = (await db.query(createRpc, [{ shopId: shop.id, slotId: slot, serviceIds: [service.id], symptomNotes: '', vehicle, idempotencyKey: randomUUID() }])).rows[0].result.booking;
  await apply(db, 11, action(booking.id, 'CONFIRM_BOOKING', 0));
  await apply(db, 11, action(booking.id, 'ASSIGN_TECHNICIAN', 1, { technicianUserId: user(12) }));
  await apply(db, 12, action(booking.id, 'START_INSPECTION', 2));
  return { shopId: shop.id, bookingId: booking.id, partId: part.id };
}

const action = (bookingId, actionName, expectedVersion, payload = {}) => ({
  bookingId, action: actionName, expectedVersion, payload, idempotencyKey: randomUUID(),
});
async function apply(db, actor, body) {
  await asUser(db, actor);
  return (await db.query(actionRpc, [body])).rows[0].result;
}
const estimatePayload = partId => ({
  diagnosisNote: 'Front brake pads are below safe operating thickness.',
  items: [
    { kind: 'PART', partId, descriptionSnapshot: 'Brake pad set', quantity: 2, unitPricePkr: 1500 },
    { kind: 'LABOUR', descriptionSnapshot: 'Brake service labour', quantity: 1, unitPricePkr: 2500 },
  ],
});

test('B07 technician submits, SA sends exact snapshot, owning customer approves and totals are computed', () => withDatabase(async db => {
  const { bookingId, partId } = await setup(db);
  let result = await apply(db, 12, action(bookingId, 'SUBMIT_ESTIMATE', 3, estimatePayload(partId)));
  assert.equal(result.booking.status, 'ESTIMATE_REVIEW');
  assert.equal(result.booking.stateVersion, 4);
  assert.equal(result.booking.estimates[0].state, 'REVIEW');
  assert.equal(result.booking.estimates[0].subtotalPkr, 5500);

  const sentPayload = { ...estimatePayload(partId), items: [
    { kind: 'PART', partId, descriptionSnapshot: 'Brake pad set - OEM', quantity: 2, unitPricePkr: 1700 },
    { kind: 'LABOUR', descriptionSnapshot: 'Brake service labour and bedding', quantity: 1, unitPricePkr: 2600 },
  ] };
  result = await apply(db, 11, action(bookingId, 'SEND_ESTIMATE', 4, sentPayload));
  assert.equal(result.booking.status, 'AWAITING_CUSTOMER');
  const sent = result.booking.estimates[0];
  assert.equal(sent.state, 'SENT');
  assert.equal(sent.subtotalPkr, 6000);
  const sentPart = sent.items.find(item => item.kind === 'PART');
  assert.equal(sentPart.descriptionSnapshot, 'Brake pad set - OEM');
  assert.equal(sentPart.lineTotalPkr, 3400);
  assert.ok(sent.sentAt);

  await asUser(db, 4);
  await expectSqlState(db, actionRpc, [action(bookingId, 'APPROVE_ESTIMATE', 5)], 'P0002');
  await asUser(db, 12);
  await expectSqlState(db, actionRpc, [action(bookingId, 'APPROVE_ESTIMATE', 5)], '42501');

  result = await apply(db, 3, action(bookingId, 'APPROVE_ESTIMATE', 5));
  assert.equal(result.booking.status, 'ESTIMATE_APPROVED');
  assert.equal(result.booking.estimates[0].state, 'APPROVED');
  assert.equal(result.booking.estimates[0].subtotalPkr, 6000);
  assert.equal(result.booking.estimates[0].items.find(item => item.kind === 'PART').descriptionSnapshot, 'Brake pad set - OEM');
  assert.ok(result.booking.estimates[0].decidedAt);
}));

test('B07 rejection preserves sent version and SA revision increments revision number', () => withDatabase(async db => {
  const { bookingId, partId } = await setup(db);
  await apply(db, 12, action(bookingId, 'SUBMIT_ESTIMATE', 3, estimatePayload(partId)));
  await apply(db, 11, action(bookingId, 'SEND_ESTIMATE', 4, estimatePayload(partId)));
  let result = await apply(db, 3, action(bookingId, 'REJECT_ESTIMATE', 5, { reason: 'Need a lower price' }));
  assert.equal(result.booking.status, 'ESTIMATE_REJECTED');
  assert.equal(result.booking.estimates[0].state, 'REJECTED');

  const revisedPayload = { diagnosisNote: 'Customer requested a revised brake estimate.', items: [
    { kind: 'LABOUR', descriptionSnapshot: 'Brake inspection and adjustment', quantity: 1, unitPricePkr: 1800 },
  ] };
  result = await apply(db, 11, action(bookingId, 'REVISE_ESTIMATE', 6, revisedPayload));
  assert.equal(result.booking.status, 'ESTIMATE_REVIEW');
  assert.equal(result.booking.estimates.length, 2);
  assert.equal(result.booking.estimates[0].revisionNo, 1);
  assert.equal(result.booking.estimates[0].state, 'REJECTED');
  assert.equal(result.booking.estimates[1].revisionNo, 2);
  assert.equal(result.booking.estimates[1].state, 'REVIEW');
  assert.equal(result.booking.estimates[1].subtotalPkr, 1800);
}));

test('B07 estimate payload validation rejects client totals, missing parts and labour part IDs', () => withDatabase(async db => {
  const { bookingId, partId } = await setup(db);
  const base = estimatePayload(partId);
  await asUser(db, 12);
  await expectSqlState(db, actionRpc, [action(bookingId, 'SUBMIT_ESTIMATE', 3, { ...base, subtotalPkr: 1 })], '22023');
  await expectSqlState(db, actionRpc, [action(bookingId, 'SUBMIT_ESTIMATE', 3, {
    diagnosisNote: 'Part must belong to the same shop.',
    items: [{ kind: 'PART', partId: randomUUID(), descriptionSnapshot: 'Foreign part', quantity: 1, unitPricePkr: 1 }],
  })], 'P0002');
  await expectSqlState(db, actionRpc, [action(bookingId, 'SUBMIT_ESTIMATE', 3, {
    diagnosisNote: 'Labour cannot carry inventory references.',
    items: [{ kind: 'LABOUR', partId, descriptionSnapshot: 'Labour with part', quantity: 1, unitPricePkr: 1 }],
  })], '22023');
}));

