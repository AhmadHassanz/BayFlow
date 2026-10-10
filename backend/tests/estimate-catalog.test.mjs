import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { asUser, booking, expectSqlState, shop, user, withDatabase } from './helpers.mjs';

const rpc = 'select public.list_estimate_catalog($1) as result';
test('F08 catalog exposes same-shop active names/IDs including zero stock; base inventory stays private', () => withDatabase(async db => {
  const zero = randomUUID(); const inactive = randomUUID();
  await db.query(`insert into public.inventory_parts(id, shop_id, sku, name, quantity_on_hand, reorder_level, unit_cost_pkr, active)
    values ($1,$2,'ZERO-STOCK','Unavailable belt',0,1,900,true),($3,$2,'INACTIVE','Retired belt',8,1,900,false)`, [zero, shop(1), inactive]);
  await asUser(db, 12);
  const result = (await db.query(rpc, [{ bookingId: booking(1) }])).rows[0].result;
  assert.deepEqual(result.items.find(item => item.id === zero), { id: zero, sku: 'ZERO-STOCK', name: 'Unavailable belt' });
  assert.ok(!result.items.some(item => item.id === inactive));
  assert.ok(result.items.every(item => Object.keys(item).sort().join(',') === 'id,name,sku'));
  assert.equal(result.pageSize, 50); assert.equal(result.page, 1); assert.equal(result.total, 2);
  assert.equal((await db.query('select * from public.inventory_parts')).rowCount, 0);
  await expectSqlState(db, 'update public.inventory_parts set quantity_on_hand=99 where id=$1', [zero], '42501');
}));
test('F08 catalog denies unrelated role, foreign/unassigned job and revoked technician membership', () => withDatabase(async db => {
  for (const actor of [1, 3, 11, 13, 14, 22]) {
    await asUser(db, actor);
    await expectSqlState(db, rpc, [{ bookingId: booking(1) }], 'P0002');
  }
  await asUser(db, 12);
  for (const target of [booking(2), randomUUID()]) await expectSqlState(db, rpc, [{ bookingId: target }], 'P0002');
  await db.query('reset role');
  await db.query('update public.shop_memberships set active=false where shop_id=$1 and user_id=$2', [shop(1), user(12)]);
  await asUser(db, 12);
  await expectSqlState(db, rpc, [{ bookingId: booking(1) }], 'P0002');
  await asUser(db, null);
  await expectSqlState(db, rpc, [{ bookingId: booking(1) }], '42501');
  await asUser(db, null, 'anon');
  await expectSqlState(db, rpc, [{ bookingId: booking(1) }], '42501');
}));
test('F08 catalog rejects spoofed tenant/actor fields, missing IDs and malformed/out-of-range pages', () => withDatabase(async db => {
  await asUser(db, 12);
  for (const input of [null, [], {}, { bookingId: 'bad' }, { bookingId: booking(1), shopId: shop(2) },
    { bookingId: booking(1), actorId: user(22) }, { bookingId: booking(1), page: '1' },
    { bookingId: booking(1), page: 0 }, { bookingId: booking(1), page: 100000 }, { bookingId: booking(1), page: 1.5 }])
    await expectSqlState(db, rpc, [input], '22023');
}));
test('F08 catalog uses bounded deterministic pagination and narrow wrapper privileges', () => withDatabase(async db => {
  await db.query(`insert into public.inventory_parts(shop_id,sku,name,quantity_on_hand,reorder_level,unit_cost_pkr)
    select $1,'PAGE-'||lpad(n::text,3,'0'),'Catalog fixture '||n,0,0,0 from generate_series(1,54) n`, [shop(1)]);
  await asUser(db, 12);
  const first = (await db.query(rpc, [{ bookingId: booking(1), page: 1 }])).rows[0].result;
  const second = (await db.query(rpc, [{ bookingId: booking(1), page: 2 }])).rows[0].result;
  assert.equal(first.items.length, 50); assert.equal(second.items.length, 5); assert.equal(second.total, 55);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 55);
  assert.deepEqual(first, (await db.query(rpc, [{ bookingId: booking(1), page: 1 }])).rows[0].result);
  assert.equal((await db.query(rpc, [{ bookingId: booking(1), page: 3 }])).rows[0].result.items.length, 0);
  await db.query('reset role');
  const functions = (await db.query(`select n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname in ('list_estimate_catalog','list_estimate_catalog_impl') order by n.nspname`)).rows;
  assert.equal(functions.find(row => row.nspname === 'public').prosecdef, false);
  assert.equal(functions.find(row => row.nspname === 'private').prosecdef, true);
  assert.ok(functions.every(row => row.proconfig.includes('search_path=""')));
  assert.equal((await db.query(`select has_function_privilege('anon','public.list_estimate_catalog(jsonb)','EXECUTE') as allowed`)).rows[0].allowed, false);
}));
