import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asUser, booking, expectSqlState, id, shop, user, withDatabase } from './helpers.mjs';

async function createRelatedFixtures(db) {
  for (const number of [1, 2, 3]) {
    const tenant = shop(number);
    const job = booking(number);
    const part = id('50', number);
    const estimate = id('80', number);
    const order = id('90', number);
    const run = id('91', number);
    await db.query('insert into public.booking_services(shop_id,booking_id,service_id) values ($1,$2,$3)', [tenant,job,id('30',number)]);
    await db.query("insert into public.estimates(id,shop_id,booking_id,revision_no,state,sent_at) values ($1,$2,$3,1,'SENT',now())", [estimate,tenant,job]);
    await db.query("insert into public.estimate_items(shop_id,estimate_id,kind,description_snapshot,quantity,unit_price_pkr) values ($1,$2,'LABOUR','Inspection',1,0)", [tenant,estimate]);
    await db.query('insert into public.purchase_orders(id,shop_id,booking_id,created_by) values ($1,$2,$3,$4)', [order,tenant,job,user(number*10+3)]);
    await db.query('insert into public.purchase_order_items(shop_id,purchase_order_id,part_id,quantity_ordered) values ($1,$2,$3,1)', [tenant,order,part]);
    await db.query('insert into public.part_allocations(shop_id,booking_id,part_id,quantity,allocated_by) values ($1,$2,$3,1,$4)', [tenant,job,part,user(number*10+3)]);
    await db.query('insert into public.qc_runs(id,shop_id,booking_id,inspector_user_id) values ($1,$2,$3,$4)', [run,tenant,job,user(number*10+4)]);
    await db.query("insert into public.qc_issues(shop_id,booking_id,qc_run_id,reported_by,title,description) values ($1,$2,$3,$4,'Test issue','Transactional test fixture')", [tenant,job,run,user(number*10+4)]);
    await db.query("insert into public.booking_history(shop_id,booking_id,actor_user_id,to_status,action) values ($1,$2,$3,'QC_PENDING','TEST_FIXTURE')", [tenant,job,user(number*10+1)]);
  }
}

const relatedTables = [
  'booking_services', 'estimates', 'estimate_items', 'part_allocations',
  'qc_runs', 'qc_issues', 'booking_history',
];

for (const [actor, tenants] of [
  [11,[1]], [12,[1]], [13,[1]], [14,[1]], [21,[2]], [22,[2]], [23,[2]], [24,[2]],
  [31,[3]], [32,[3]], [33,[3]], [34,[3]], [1,[1,3]], [2,[2]], [3,[1,3]], [4,[2]],
]) {
  test(`identity ${actor} has matching tenant scope on every booking child table`, () => withDatabase(async (db) => {
    await createRelatedFixtures(db);
    await asUser(db, actor);
    for (const table of relatedTables) {
      const result=await db.query(`select distinct shop_id from public.${table} order by shop_id`);
      assert.deepEqual(result.rows.map((row) => row.shop_id), tenants.map(shop), table);
    }
    for (const table of ['purchase_orders', 'purchase_order_items']) {
      const permitted = [1,2,13,23,33].includes(actor) ? tenants.map(shop) : [];
      assert.deepEqual((await db.query(`select distinct shop_id from public.${table} order by shop_id`)).rows.map((row) => row.shop_id), permitted, table);
    }
  }));
}

test('missing JWT subject exposes no private rows even with authenticated role', () => withDatabase(async (db) => {
  await createRelatedFixtures(db);
  await asUser(db, null);
  for (const table of ['profiles', 'vehicles', 'shops', 'shop_memberships', 'bookings', ...relatedTables]) {
    assert.equal((await db.query(`select * from public.${table}`)).rowCount, 0, table);
  }
}));

test('every tenant child rejects a mismatched parent shop', () => withDatabase(async (db) => {
  await createRelatedFixtures(db);
  for (const table of relatedTables) {
    await expectSqlState(db, `update public.${table} set shop_id=$1 where shop_id=$2`, [shop(2),shop(1)], table === 'booking_history' ? '23514' : '23503');
  }
  for (const table of ['purchase_orders','purchase_order_items']) {
    await expectSqlState(db, `update public.${table} set shop_id=$1 where shop_id=$2`, [shop(2),shop(1)], '23503');
  }
}));

test('all shop-owned tables carry shop_id and PKs are UUID', () => withDatabase(async (db) => {
  const owned = await db.query(`
    select t.table_name from information_schema.tables t
    where t.table_schema='public' and t.table_type='BASE TABLE'
      and t.table_name not in ('profiles','vehicles','shops')
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema=t.table_schema and c.table_name=t.table_name and c.column_name='shop_id'
      )
  `);
  assert.equal(owned.rowCount,0);
  const primaryKeys=await db.query(`
    select c.relname, a.attname, format_type(a.atttypid,a.atttypmod) as type
    from pg_constraint p join pg_class c on c.oid=p.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=any(p.conkey)
    where p.contype='p' and n.nspname='public'
  `);
  assert.equal(primaryKeys.rowCount,18);
  for(const column of primaryKeys.rows) assert.equal(column.type,'uuid',column.relname);
}));
