import assert from 'node:assert/strict';
import pg from 'pg';

export const id = (prefix, number) => `${prefix}000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
export const user = (number) => id('10', number);
export const shop = (number) => id('20', number);
export const booking = (number) => id('70', number);

export async function withDatabase(callback) {
  const connectionString = process.env.BAYFLOW_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Database tests accept only loopback databases. No Cloud database is modified.');
  }
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`
      insert into public.bookings(id, shop_id, customer_id, vehicle_id, slot_id, status, technician_user_id, parts_user_id)
      values
        ($1, $2, $3, $4, $5, 'QC_PENDING', $6, $7),
        ($8, $9, $10, $11, $12, 'QC_PENDING', $13, $14),
        ($15, $16, $3, $4, $17, 'QC_PENDING', $18, $19)
    `, [booking(1), shop(1), user(3), id('60', 1), id('40', 1), user(12), user(13),
      booking(2), shop(2), user(4), id('60', 2), id('40', 2), user(22), user(23),
      booking(3), shop(3), id('40', 3), user(32), user(33)]);
    await callback(client);
  } finally {
    await client.query('rollback');
    await client.end();
  }
}

export async function asUser(client, userNumber, role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role));
  await client.query(`set local role ${role}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userNumber === null ? '' : user(userNumber)]);
}

export async function expectSqlState(client, query, parameters, code) {
  await client.query('savepoint expected_failure');
  try {
    await assert.rejects(client.query(query, parameters), { code });
  } finally {
    await client.query('rollback to savepoint expected_failure');
    await client.query('release savepoint expected_failure');
  }
}
