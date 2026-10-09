import assert from 'node:assert/strict';
import test from 'node:test';
import { scanText, templateProblems, envEntries } from '../scripts/check-repository.mjs';

test('redacts privileged credentials and reports their location', () => {
  const secret = ['sb', 'secret', 'a'.repeat(24)].join('_');
  const result = scanText(`first line\nKEY=${secret}`, 'example.txt');
  assert.equal(result[0].line, 2);
  assert.equal(result[0].kind, 'secret key');
  assert.ok(!JSON.stringify(result).includes(secret));
});
test('detects privileged JWTs but accepts anon JWTs', () => {
  const jwt = role => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(scanText(jwt('service_role'), 'test').length, 1);
  assert.deepEqual(scanText(jwt('anon'), 'test'), []);
});
test('distinguishes local disposable database URLs from remote credentials', () => {
  const url = host => ['postgresql://', 'user:', 'example-password', '@', host, '/postgres'].join('');
  for (const host of ['localhost', '127.0.0.1:54322', '[::1]:54322']) assert.deepEqual(scanText(url(host), 'test'), []);
  assert.equal(scanText(url('db.example.test'), 'test')[0].kind, 'remote credential URL');
});
test('detects exact local secrets without returning their value', () => {
  const value = 'synthetic-sensitive-value';
  const result = scanText(`PASSWORD=${value}`, 'test', [value]);
  assert.equal(result[0].kind, 'matches a local secret');
  assert.ok(!JSON.stringify(result).includes(value));
});
test('env templates permit empty placeholders and local site origin only', () => {
  assert.deepEqual(templateProblems('SUPABASE_SECRET_KEY=\nNEXT_PUBLIC_SITE_URL=http://localhost:3000', 'template'), []);
  assert.equal(templateProblems('SUPABASE_SECRET_KEY=some-configured-value', 'template').length, 1);
  assert.equal(templateProblems('NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co', 'template').length, 1);
});
test('parses quoted and exported env entries without treating comments as values', () => {
  assert.deepEqual(envEntries('# comment\nexport PASSWORD="synthetic value"\nEMPTY='), [{ name: 'PASSWORD', value: 'synthetic value' }, { name: 'EMPTY', value: '' }]);
});
