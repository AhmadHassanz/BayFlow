import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asUser, expectSqlState, shop, user, withDatabase } from './helpers.mjs';

const newUser = user(99);
async function provision(db, metadata = {}) {
  await db.query(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3,$4)`,
    [newUser, 'native-b03@bayflow.example.test', { full_name: 'New staff', role: 'OWNER' }, metadata]);
}
const marker = { bayflow_provisioned_by: user(1), bayflow_provisioned_shop: shop(1) };
const add = "select public.add_staff_membership($1,$2,$3) as membership";

test('B03 profile sync creates only the session identity and never a membership', () => withDatabase(async db => {
  await provision(db);
  await asUser(db, 99);
  const profile = (await db.query('select public.sync_profile() as profile')).rows[0].profile;
  assert.equal(profile.id, newUser);
  assert.equal(profile.fullName, 'New staff');
  assert.equal((await db.query('select * from public.shop_memberships')).rowCount, 0);
  assert.equal((await db.query('select public.sync_profile() as profile')).rows[0].profile.id, newUser);
  await expectSqlState(db, "insert into public.profiles(id,full_name) values ($1,'Spoof')", [user(2)], '42501');
}));

test('B03 profile sync rejects a missing subject and anonymous execution', () => withDatabase(async db => {
  await asUser(db, null);
  await expectSqlState(db, 'select public.sync_profile()', [], '42501');
  await asUser(db, null, 'anon');
  await expectSqlState(db, 'select public.sync_profile()', [], '42501');
}));

for (const role of ['SA', 'TECHNICIAN', 'PARTS', 'QC']) {
  test(`B03 owner creates ${role} membership with an atomic profile`, () => withDatabase(async db => {
    await provision(db, marker);
    await asUser(db, 1);
    const member = (await db.query(add, [shop(1), newUser, role])).rows[0].membership;
    assert.deepEqual({ shopId: member.shopId, userId: member.userId, role: member.role, active: member.active },
      { shopId: shop(1), userId: newUser, role, active: true });
    assert.equal((await db.query('select full_name from public.profiles where id=$1', [newUser])).rows[0].full_name, 'New staff');
    await expectSqlState(db, add, [shop(1), newUser, role], '23505');
    await db.query('set constraints all immediate');
  }));
}

test('B03 owner A cannot provision or edit in shop B', () => withDatabase(async db => {
  await provision(db, marker);
  await asUser(db, 1);
  await expectSqlState(db, add, [shop(2), newUser, 'SA'], '42501');
  await expectSqlState(db, "select public.edit_staff_membership($1,$2,'QC',null)", [shop(2), newUser], '42501');
}));

for (const actor of [3, 11, 12, 13, 14, 99]) {
  test(`B03 actor ${actor} cannot self-provision or create staff`, () => withDatabase(async db => {
    await provision(db, marker);
    await asUser(db, actor);
    await expectSqlState(db, add, [shop(1), newUser, 'SA'], '42501');
  }));
}

test('B03 user metadata cannot forge the Admin provisioning marker', () => withDatabase(async db => {
  await provision(db);
  await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [{ ...marker, full_name: 'Spoof' }, newUser]);
  await asUser(db, 1);
  await expectSqlState(db, add, [shop(1), newUser, 'SA'], '42501');
  await expectSqlState(db, add, [shop(1), newUser, 'OWNER'], '22023');
  assert.equal((await db.query('select * from public.profiles where id=$1', [newUser])).rowCount, 0);
}));

test('B03 provisioning marker binds both actor and tenant', () => withDatabase(async db => {
  await provision(db, { ...marker, bayflow_provisioned_shop: shop(3) });
  await asUser(db, 1);
  await expectSqlState(db, add, [shop(1), newUser, 'QC'], '42501');
  await asUser(db, 2);
  await expectSqlState(db, add, [shop(2), newUser, 'QC'], '42501');
}));

test('B03 role edits and deactivation preserve membership identity and revoke reads', () => withDatabase(async db => {
  const member = (await db.query('select id from public.shop_memberships where shop_id=$1 and user_id=$2', [shop(1), user(11)])).rows[0];
  await asUser(db, 1);
  let result = (await db.query("select public.edit_staff_membership($1,$2,'PARTS',null) as m", [shop(1), member.id])).rows[0].m;
  assert.equal(result.role, 'PARTS');
  result = (await db.query('select public.edit_staff_membership($1,$2,null,false) as m', [shop(1), member.id])).rows[0].m;
  assert.equal(result.active, false);
  assert.equal(result.userId, user(11));
  await asUser(db, 11);
  assert.equal((await db.query('select * from public.bookings')).rowCount, 0);
  assert.equal((await db.query('select * from public.shop_memberships')).rowCount, 0);
}));

test('B03 prevents owner edits, foreign membership IDs, empty patches and role escalation', () => withDatabase(async db => {
  const rows = (await db.query('select id,shop_id,role from public.shop_memberships')).rows;
  const owner = rows.find(row => row.shop_id === shop(1) && row.role === 'OWNER');
  const staff = rows.find(row => row.shop_id === shop(1) && row.role === 'SA');
  const foreign = rows.find(row => row.shop_id === shop(2) && row.role === 'SA');
  await asUser(db, 1);
  await expectSqlState(db, 'select public.edit_staff_membership($1,$2,null,false)', [shop(1), owner.id], '42501');
  await expectSqlState(db, "select public.edit_staff_membership($1,$2,'OWNER',null)", [shop(1), staff.id], '22023');
  await expectSqlState(db, 'select public.edit_staff_membership($1,$2)', [shop(1), staff.id], '22023');
  await expectSqlState(db, 'select public.edit_staff_membership($1,$2,null,false)', [shop(1), foreign.id], 'P0002');
}));

test('B03 RPC grants expose only invoker wrappers and guarded implementations', () => withDatabase(async db => {
  const publicNames = ['sync_profile', 'add_staff_membership', 'edit_staff_membership'];
  const { rows } = await db.query(`select p.proname,p.prosecdef,p.proconfig,n.nspname,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as user_exec,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname=any($1)`, [[...publicNames, ...publicNames.map(n => `${n}_impl`), 'require_team_owner']]);
  assert.equal(rows.length, 7);
  for (const row of rows) {
    assert.ok(row.proconfig.includes('search_path=""'), row.proname);
    assert.equal(row.anon_exec, false, row.proname);
    assert.equal(row.prosecdef, row.nspname === 'private', row.proname);
    assert.equal(row.user_exec, row.proname !== 'require_team_owner', row.proname);
  }
}));
