import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const script = await readFile(new URL('../scripts/provision-cloud-demo.mjs', import.meta.url), 'utf8');

test('B11 demo provisioning script refuses hardcoded demo passwords and Cloud seed imports', () => {
  assert.match(script, /BAYFLOW_DEMO_PASSWORD/);
  assert.doesNotMatch(script, /BayFlow-Local-2026!/);
  assert.doesNotMatch(script, /--include-seed/);
  assert.doesNotMatch(script, /supabase\/seed\.sql/);
  assert.match(script, /bayflow-demo-b11-v1/);
  assert.match(script, /email: `demo-\$\{handle\}@bayflow\.example\.test`/);
});

test('B11 demo provisioning script documents deterministic demo shops and role coverage', () => {
  for (const slug of ['demo-lahore-auto-care', 'demo-city-motors', 'demo-northside-garage']) assert.match(script, new RegExp(slug));
  for (const role of ['OWNER', 'SA', 'TECHNICIAN', 'PARTS', 'QC']) assert.match(script, new RegExp(role));
  for (const phrase of ['B10 migration must be applied', 'Linked project does not match', 'password: \'not printed\'', 'Demo sign-in failed', 'loginVerified']) assert.match(script, new RegExp(phrase));
});
