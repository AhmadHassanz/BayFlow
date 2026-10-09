import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sqlLiteral, fixtureInsert } from '../supabase/tests/support/cloud-client.mjs';

test('Cloud fixture JSON remains structured and SQL-escapes embedded quotes',()=>{
  const hours={mon:[['09:00','18:00']],note:"Garage's hours"};
  assert.equal(sqlLiteral(hours),`'{"mon":[["09:00","18:00"]],"note":"Garage''s hours"}'::jsonb`);
  assert.ok(fixtureInsert('shops',[{id:'fixture',working_hours:hours}]).includes(`${sqlLiteral(hours)}`));
  assert.deepEqual(hours.mon,[['09:00','18:00']]);
  assert.throws(()=>sqlLiteral(undefined),/Unsupported/);
});
