import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { asUser, booking, expectSqlState, id, shop, user, withDatabase } from './helpers.mjs';

test('all 18 application tables have RLS and no ordinary-user write privileges', () => withDatabase(async (db) => {
  const { rows } = await db.query(`
    select c.relname, c.relrowsecurity,
      has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as can_write,
      has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_access
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `);
  assert.equal(rows.length, 18);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true, row.relname);
    assert.equal(row.can_write, false, row.relname);
    assert.equal(row.anon_access, false, row.relname);
  }
}));

test('private functions have fixed search paths and no anonymous execution', () => withDatabase(async (db) => {
  const { rows } = await db.query(`
    select p.oid::regprocedure::text as name, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
  `);
  assert.ok(rows.length >= 10);
  for (const row of rows) {
    assert.ok(row.proconfig.includes('search_path=""'), row.name);
    assert.equal(row.anon_execute, false, row.name);
  }
  assert.equal((await db.query("select has_schema_privilege('anon','private','USAGE') as allowed")).rows[0].allowed, false);
}));

test('required role and booking status enums are frozen', () => withDatabase(async (db) => {
  const roles = await db.query("select unnest(enum_range(null::public.shop_role))::text as value");
  assert.deepEqual(roles.rows.map((row) => row.value), ['OWNER', 'SA', 'TECHNICIAN', 'PARTS', 'QC']);
  const statuses = await db.query("select unnest(enum_range(null::public.booking_status))::text as value");
  assert.deepEqual(statuses.rows.map((row) => row.value), [
    'PENDING','CONFIRMED','ASSIGNED','INSPECTING','ESTIMATE_REVIEW','AWAITING_CUSTOMER',
    'ESTIMATE_APPROVED','ESTIMATE_REJECTED','PARTS_PENDING','PARTS_ORDERED','PARTS_READY',
    'IN_REPAIR','QC_PENDING','QC_IN_PROGRESS','READY_FOR_PICKUP','COMPLETED','CANCELLED',
  ]);
}));

test('anon sees safe published projections and no private base tables', () => withDatabase(async (db) => {
  await db.query('update public.shops set active = false where id = $1', [shop(3)]);
  await asUser(db, null, 'anon');
  assert.equal((await db.query('select * from public.public_shops')).rowCount, 2);
  assert.equal((await db.query('select * from public.public_services')).rowCount, 2);
  const columns = (await db.query('select * from public.public_shops limit 1')).fields.map((field) => field.name);
  assert.ok(!columns.includes('owner_user_id'));
  await expectSqlState(db, 'select * from public.bookings', [], '42501');
  await expectSqlState(db, 'select * from public.profiles', [], '42501');
}));

for (const [number, expected] of [[11, [booking(1)]], [21, [booking(2)]], [31, [booking(3)]],
  [12, [booking(1)]], [13, [booking(1)]], [14, [booking(1)]],
  [22, [booking(2)]], [23, [booking(2)]], [24, [booking(2)]],
  [32, [booking(3)]], [33, [booking(3)]], [34, [booking(3)]],
  [1, [booking(1), booking(3)]], [2, [booking(2)]], [3, [booking(1), booking(3)]], [4, [booking(2)]]]) {
  test(`identity ${number} sees exactly its authorized bookings`, () => withDatabase(async (db) => {
    await asUser(db, number);
    assert.deepEqual((await db.query('select id from public.bookings order by id')).rows.map((row) => row.id), expected);
  }));
}

test('unassigned technician cannot read a shop job or its customer profile', () => withDatabase(async (db) => {
  await db.query("insert into public.shop_memberships(shop_id,user_id,role) values ($1,$2,'TECHNICIAN')", [shop(1), user(2)]);
  await asUser(db, 2);
  assert.equal((await db.query('select id from public.bookings where id = $1', [booking(1)])).rowCount, 0);
  assert.equal((await db.query('select id from public.profiles where id = $1', [user(3)])).rowCount, 0);
}));

test('inactive membership loses tenant access', () => withDatabase(async (db) => {
  await db.query('update public.shop_memberships set active=false where shop_id=$1 and user_id=$2', [shop(1), user(11)]);
  await asUser(db, 11);
  assert.equal((await db.query('select * from public.bookings')).rowCount, 0);
  assert.equal((await db.query('select * from public.shop_memberships')).rowCount, 0);
}));

test('QC sees the queue and its own claim, not another inspector claim', () => withDatabase(async (db) => {
  await db.query("insert into public.shop_memberships(shop_id,user_id,role) values ($1,$2,'QC')", [shop(1), user(2)]);
  await db.query("update public.bookings set status='QC_IN_PROGRESS',qc_claimed_by=$1 where id=$2", [user(2), booking(1)]);
  await asUser(db, 14);
  assert.equal((await db.query('select * from public.bookings')).rowCount, 0);
}));

test('only parts staff and owners see private inventory in their shops', () => withDatabase(async (db) => {
  await asUser(db, 13);
  assert.deepEqual((await db.query('select shop_id from public.inventory_parts')).rows, [{ shop_id: shop(1) }]);
  await asUser(db, 12);
  assert.equal((await db.query('select * from public.inventory_parts')).rowCount, 0);
  await asUser(db, 1);
  assert.equal((await db.query('select * from public.inventory_parts')).rowCount, 2);
}));

test('customers cannot read unsent estimate drafts', () => withDatabase(async (db) => {
  await db.query('insert into public.estimates(shop_id,booking_id,revision_no) values ($1,$2,1)', [shop(1), booking(1)]);
  await asUser(db, 3);
  assert.equal((await db.query('select * from public.estimates')).rowCount, 0);
  await asUser(db, 12);
  assert.equal((await db.query('select * from public.estimates')).rowCount, 1);
}));

test('notification reads require recipient and matching tenant or customer booking', () => withDatabase(async (db) => {
  await db.query(`insert into public.notifications(user_id,shop_id,booking_id,type,title,message) values
    ($1,$2,$3,'TEST','Test','Own booking'),($1,$4,$5,'TEST','Test','Foreign tenant'),
    ($6,$2,$3,'TEST','Test','Another recipient')`, [user(3), shop(1), booking(1), shop(2), booking(2), user(4)]);
  await asUser(db, 3);
  assert.equal((await db.query('select * from public.notifications')).rowCount, 1);
}));

test('direct status, stock, history, membership and notification writes are blocked', () => withDatabase(async (db) => {
  await asUser(db, 1);
  for (const query of [
    "update public.bookings set status='IN_REPAIR'", 'update public.inventory_parts set quantity_on_hand=999',
    "update public.shop_memberships set role='OWNER'", 'delete from public.booking_history',
    'update public.notifications set read_at=now()',
  ]) await expectSqlState(db, query, [], '42501');
}));

test('cross-shop slot, staff and customer vehicle references fail', () => withDatabase(async (db) => {
  for (const [column, value] of [['slot_id', id('40',2)], ['technician_user_id', user(22)],
    ['parts_user_id', user(23)], ['qc_claimed_by', user(24)], ['vehicle_id', id('60',2)]]) {
    await expectSqlState(db, `update public.bookings set ${column}=$1 where id=$2`, [value, booking(1)], '23503');
  }
}));

test('booking services cannot cross shops and cannot be duplicated', () => withDatabase(async (db) => {
  await expectSqlState(db, 'insert into public.booking_services(shop_id,booking_id,service_id) values ($1,$2,$3)',
    [shop(1), booking(1), id('30',2)], '23503');
  await db.query('insert into public.booking_services(shop_id,booking_id,service_id) values ($1,$2,$3)', [shop(1), booking(1), id('30',1)]);
  await expectSqlState(db, 'insert into public.booking_services(shop_id,booking_id,service_id) values ($1,$2,$3)',
    [shop(1), booking(1), id('30',1)], '23505');
}));

test('slot uniqueness, positive capacity, date order and nonnegative stock are enforced', () => withDatabase(async (db) => {
  await expectSqlState(db, 'insert into public.appointment_slots(shop_id,starts_at,ends_at,capacity) select shop_id,starts_at,ends_at,capacity from public.appointment_slots limit 1', [], '23505');
  await expectSqlState(db, 'update public.appointment_slots set capacity=0', [], '23514');
  await expectSqlState(db, 'update public.appointment_slots set ends_at=starts_at', [], '23514');
  await expectSqlState(db, 'update public.inventory_parts set quantity_on_hand=-1', [], '23514');
  await expectSqlState(db, 'update public.bookings set state_version=-1', [], '23514');
}));

test('estimate items compute integer totals and enforce part kind, tenant and subtotal', () => withDatabase(async (db) => {
  const estimateId = id('80',1);
  await db.query('insert into public.estimates(id,shop_id,booking_id,revision_no) values ($1,$2,$3,1)', [estimateId, shop(1), booking(1)]);
  const query = 'insert into public.estimate_items(shop_id,estimate_id,kind,part_id,description_snapshot,quantity,unit_price_pkr) values ($1,$2,$3,$4,$5,$6,$7) returning line_total_pkr';
  await expectSqlState(db, query, [shop(1),estimateId,'PART',null,'Pads',1,6500], '23514');
  await expectSqlState(db, query, [shop(1),estimateId,'LABOUR',id('50',1),'Labour',1,4000], '23514');
  await expectSqlState(db, query, [shop(1),estimateId,'PART',id('50',2),'Pads',1,6500], '23503');
  assert.equal((await db.query(query, [shop(1),estimateId,'PART',id('50',1),'Pads',2,6500])).rows[0].line_total_pkr, 13000);
  await expectSqlState(db, 'set constraints all immediate', [], '23514');
  await db.query('update public.estimates set subtotal_pkr=13000 where id=$1', [estimateId]);
  await db.query('set constraints all immediate');
  await expectSqlState(db, 'insert into public.estimates(shop_id,booking_id,revision_no) values ($1,$2,1)', [shop(1),booking(1)], '23505');
}));

test('purchase orders enforce same-shop parts and receipt bounds', () => withDatabase(async (db) => {
  const orderId=id('90',1);
  await db.query('insert into public.purchase_orders(id,shop_id,booking_id,created_by) values ($1,$2,$3,$4)', [orderId,shop(1),booking(1),user(13)]);
  const query='insert into public.purchase_order_items(shop_id,purchase_order_id,part_id,quantity_ordered,quantity_received) values ($1,$2,$3,$4,$5)';
  await expectSqlState(db, query, [shop(1),orderId,id('50',2),1,0], '23503');
  await expectSqlState(db, query, [shop(1),orderId,id('50',1),2,3], '23514');
  await expectSqlState(db, query, [shop(1),orderId,id('50',1),2,-1], '23514');
  await db.query(query, [shop(1),orderId,id('50',1),2,1]);
  await expectSqlState(db, query, [shop(1),orderId,id('50',1),2,0], '23505');
}));

test('only one active allocation and QC run exist per job and part', () => withDatabase(async (db) => {
  const allocation='insert into public.part_allocations(shop_id,booking_id,part_id,quantity,allocated_by) values ($1,$2,$3,1,$4)';
  const values=[shop(1),booking(1),id('50',1),user(13)];
  await db.query(allocation,values);
  await expectSqlState(db,allocation,values,'23505');
  const qc='insert into public.qc_runs(shop_id,booking_id,inspector_user_id) values ($1,$2,$3)';
  await db.query(qc,[shop(1),booking(1),user(14)]);
  await expectSqlState(db,qc,[shop(1),booking(1),user(14)],'23505');
  await expectSqlState(db,'update public.qc_runs set inspector_user_id=$1 where booking_id=$2',[user(24),booking(1)],'23503');
}));

test('QC issue cannot reference another booking run', () => withDatabase(async (db) => {
  const runId=id('91',1);
  await db.query('insert into public.qc_runs(id,shop_id,booking_id,inspector_user_id) values ($1,$2,$3,$4)', [runId,shop(2),booking(2),user(24)]);
  await expectSqlState(db, 'insert into public.qc_issues(shop_id,booking_id,qc_run_id,reported_by,title,description) values ($1,$2,$3,$4,$5,$6)',
    [shop(1),booking(1),runId,user(14),'Brake noise','Noise persists'], '23503');
}));

test('history rejects mutation and prevents booking deletion', () => withDatabase(async (db) => {
  await db.query("insert into public.booking_history(shop_id,booking_id,actor_user_id,to_status,action) values ($1,$2,$3,'QC_PENDING','TEST_FIXTURE')", [shop(1),booking(1),user(11)]);
  await expectSqlState(db, "update public.booking_history set note='tamper'", [], '23514');
  await expectSqlState(db, 'delete from public.booking_history', [], '23514');
  await expectSqlState(db, 'truncate public.booking_history', [], '23514');
  await expectSqlState(db, 'delete from public.bookings where id=$1', [booking(1)], '23503');
}));

test('shop owner membership cannot be deactivated or spoofed', () => withDatabase(async (db) => {
  await db.query('update public.shop_memberships set active=false where shop_id=$1 and user_id=$2', [shop(1),user(1)]);
  await expectSqlState(db, 'set constraints all immediate', [], '23514');
}));

test('seed is repeatable without resetting passwords or duplicating entities', () => withDatabase(async (db) => {
  // Strip only seed transaction delimiters so fixtures remain inside the test rollback.
  const seed = (await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'))
    .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
  const before=await db.query('select id,encrypted_password from auth.users order by id');
  await db.query(seed);
  assert.deepEqual((await db.query('select id,encrypted_password from auth.users order by id')).rows,before.rows);
  assert.equal((await db.query('select * from public.shops')).rowCount,3);
  assert.equal((await db.query('select * from public.shop_memberships')).rowCount,15);
}));

test('seed aborts if a deterministic fixture ID belongs to another email', () => withDatabase(async (db) => {
  await db.query('update auth.users set email=$1 where id=$2', ['existing.person@example.test',user(3)]);
  const seed = (await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'))
    .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
  await expectSqlState(db,seed,[],'P0001');
}));
