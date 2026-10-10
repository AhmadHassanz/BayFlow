import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupSql, inventorySql, marker, shopIds, sqlLiteral } from '../scripts/cleanup-cloud-demo.mjs';

test('MT05 inventory is marker-bound and limited to deterministic demo shop IDs', () => {
  const sql = inventorySql();
  assert.match(sql, new RegExp(marker));
  for (const id of shopIds) assert.match(sql, new RegExp(id));
  assert.match(sql, /identity_collisions/);
  assert.match(sql, /external_dependencies/);
  assert.doesNotMatch(sql, /delete\s+from/i);
});

test('MT05 cleanup accounts for dependencies and restores the immutable-history trigger', () => {
  const sql = cleanupSql();
  const required = ['notifications','qc_issues','qc_runs','part_allocations','purchase_order_items','purchase_orders','estimate_items','estimates','booking_services','bookings','inventory_parts','services','appointment_slots','shop_memberships','shops','vehicles','profiles'];
  for (const table of required) assert.match(sql, new RegExp(`delete from public\\.${table}`));
  assert.match(sql, /disable trigger booking_history_immutable[\s\S]*delete from public\.booking_history[\s\S]*enable trigger booking_history_immutable/);
  assert.match(sql, /delete from auth\.users where id in \(select id from mt05_users\)/);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.doesNotMatch(sql, /truncate|drop table public|delete from public\.shops\s*;/i);
});

test('MT05 SQL literal escaping cannot widen a cleanup predicate', () => {
  assert.equal(sqlLiteral("x' or true --"), "'x'' or true --'");
  assert.throws(() => sqlLiteral(1));
});
