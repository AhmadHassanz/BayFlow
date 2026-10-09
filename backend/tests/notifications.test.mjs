import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asUser, booking, expectSqlState, shop, user, withDatabase } from './helpers.mjs';

const listRpc = 'select public.list_notifications($1::jsonb) as result';
const readRpc = 'select public.mark_notification_read($1::jsonb) as result';

test('B10 lists own notifications with unread filter and marks only recipient notifications read', () => withDatabase(async db => {
  await db.query(`insert into public.notifications(id,user_id,shop_id,booking_id,type,title,message,read_at,created_at) values
    ('b1000000-0000-4000-8000-000000000001',$1,$2,$3,'B10_TEST','Newest','Unread newest',null,now() - interval '3 minutes'),
    ('b1000000-0000-4000-8000-000000000002',$1,$2,$3,'B10_TEST','Older','Already read',now() - interval '9 minutes',now() - interval '10 minutes'),
    ('b1000000-0000-4000-8000-000000000003',$4,$2,$3,'B10_TEST','Other','Other recipient',null,now() - interval '2 minutes'),
    ('b1000000-0000-4000-8000-000000000004',$1,$5,$6,'B10_TEST','Foreign','Foreign booking',null,now() - interval '1 minute')`,
    [user(3), shop(1), booking(1), user(4), shop(2), booking(2)]);

  await asUser(db, 3);
  let result = (await db.query(listRpc, [{ limit: 10 }])).rows[0].result;
  assert.equal(result.unreadCount, 1);
  assert.deepEqual(result.items.map(n => n.id), [
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
  ]);

  result = (await db.query(listRpc, [{ unread: true, limit: 10 }])).rows[0].result;
  assert.deepEqual(result.items.map(n => n.id), ['b1000000-0000-4000-8000-000000000001']);

  const read = (await db.query(readRpc, [{ notificationId: 'b1000000-0000-4000-8000-000000000001' }])).rows[0].result;
  assert.equal(read.id, 'b1000000-0000-4000-8000-000000000001');
  assert.equal(read.readAt !== null, true);
  const replay = (await db.query(readRpc, [{ notificationId: 'b1000000-0000-4000-8000-000000000001' }])).rows[0].result;
  assert.equal(replay.readAt, read.readAt);

  await expectSqlState(db, readRpc, [{ notificationId: 'b1000000-0000-4000-8000-000000000003' }], 'P0002');
  await expectSqlState(db, readRpc, [{ notificationId: 'b1000000-0000-4000-8000-000000000004' }], 'P0002');
  await expectSqlState(db, listRpc, [{ limit: 51 }], '22023');
  await expectSqlState(db, listRpc, [{ extra: true }], '22023');
}));

test('B10 exposes only notification RPCs and keeps direct notification writes blocked', () => withDatabase(async db => {
  await asUser(db, 3);
  await expectSqlState(db, 'update public.notifications set read_at=now()', [], '42501');
  const functions = (await db.query(`select n.nspname, p.proname, p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE') anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') user_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('list_notifications','mark_notification_read'))
      or (n.nspname='private' and p.proname in ('notification_dto','mark_notification_read_impl'))`)).rows;
  assert.equal(functions.length, 4);
  for (const fn of functions) {
    assert.equal(fn.anon_execute, false, fn.proname);
    assert.equal(fn.user_execute, fn.proname !== 'notification_dto', fn.proname);
    assert.equal(fn.prosecdef, fn.proname === 'mark_notification_read_impl', fn.proname);
  }
}));