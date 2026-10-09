import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { connectCloud, sqlLiteral } from './support/cloud-client.mjs';
import { buildFixtures, deactivateFixtures, fixtureId, provisionIdentities, provisionRows } from './support/cloud-fixtures.mjs';

let cloud;
let data;
let fixturesReady = false;
const actors = {};
const tableNames = [
  'profiles','shops','shop_memberships','services','appointment_slots','vehicles','bookings',
  'booking_services','inventory_parts','estimates','estimate_items','purchase_orders',
  'purchase_order_items','part_allocations','qc_runs','qc_issues','booking_history','notifications',
];
const privateChildren = ['booking_services','estimate_items','part_allocations','qc_runs','qc_issues','booking_history'];

before(async () => {
  cloud=await connectCloud();
  await provisionIdentities(cloud,actors);
  data=buildFixtures(actors);
  await provisionRows(cloud,data);
  fixturesReady=true;
  console.log('Cloud B02 fixtures ready: 16 real Auth identities, three isolated test shops.');
}, {timeout:180000});

after(async () => {
  if (cloud) await deactivateFixtures(cloud,actors,fixturesReady?data:null);
  console.log('B02 test shops hidden, staff deactivated, Auth sessions signed out; audit fixtures retained.');
}, {timeout:120000});

const token=(name)=>actors[name].token;
const fixtureQuery=(table)=>`/rest/v1/${table}?select=*&id=in.(${data[table].map(row=>row.id).join(',')})&order=id`;
async function read(table, actor) {
  return cloud.requireSuccess(fixtureQuery(table),{token:actor?token(actor):undefined});
}
const ids=(rows)=>rows.map(row=>row.id).sort();
const assertIds=(rows,expected,message)=>assert.deepEqual(ids(rows),[...expected].sort(),message);
function assertDenied(response) {
  assert.ok([401,403].includes(response.status),`Expected permission denial; got HTTP ${response.status}.`);
  assert.equal(response.data?.code,'42501');
}

test('all 18 Cloud tables have RLS, one read policy, and no ordinary-user writes',async()=>{
  const rows=await cloud.query(`select c.relname as name,c.relrowsecurity,
    has_table_privilege('authenticated',c.oid,'SELECT') as user_read,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as user_write,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_access,
    (select count(*)::integer from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.cmd='SELECT') as policies,
    (select count(*)::integer from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.cmd<>'SELECT') as write_policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`);
  assert.deepEqual(rows.map(row=>row.name).sort(),[...tableNames].sort());
  for(const row of rows) {
    assert.equal(row.relrowsecurity,true,row.name);
    assert.equal(row.user_read,true,row.name);
    assert.equal(row.user_write,false,row.name);
    assert.equal(row.anon_access,false,row.name);
    assert.equal(row.policies,1,row.name);
    assert.equal(row.write_policies,0,row.name);
  }
});

test('private helper execution and search paths match the audited allowlist',async()=>{
  const versions=await cloud.query('select version from supabase_migrations.schema_migrations order by version');
  const b03=versions.some(row=>row.version==='20261009100642');
  const b04=versions.some(row=>row.version==='20261009121005');
  const b05=versions.some(row=>row.version==='20261009140203');
  const b06=versions.some(row=>row.version==='20261009151303');
  const b07=versions.some(row=>row.version==='20261009161442');
  const b08=versions.some(row=>row.version==='20261009180000');
  const allowed=['has_shop_role','can_read_booking','can_read_estimate','can_read_profile','can_read_vehicle','can_read_notification',
    ...(b03?['sync_profile_impl','add_staff_membership_impl','edit_staff_membership_impl']:[]),
    ...(b04?['save_shop_impl','save_service_impl']:[]),
    ...(b05?['create_booking_impl']:[]),
    ...(b06?['apply_booking_action_impl']:[]),
    ...(b08?['save_inventory_part_impl','list_inventory_impl']:[])];
  const rows=await cloud.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'`);
  assert.equal(rows.length,(b03?14:10)+(b04?5:0)+(b05?2:0)+(b06?6:0)+(b07?2:0)+(b08?9:0));
  for(const row of rows) {
    assert.ok(row.proconfig?.includes('search_path=""'),row.proname);
    assert.equal(row.anon_execute,false,row.proname);
    assert.equal(row.user_execute,allowed.includes(row.proname),row.proname);
    if(allowed.includes(row.proname)) assert.equal(row.prosecdef,true,row.proname);
  }
});

test('anonymous REST reads all three safe projections without owner IDs',async()=>{
  for(const view of ['public_shops','public_services','public_appointment_slots']) {
    const group=view==='public_shops'?1:view==='public_services'?3:4;
    const result=await cloud.requireSuccess(`/rest/v1/${view}?id=in.(${[1,2,3].map(n=>fixtureId(group,n)).join(',')})`);
    assertIds(result,[1,2,3].map(n=>fixtureId(group,n)),view);
    for(const row of result) assert.ok(!Object.hasOwn(row,'owner_user_id'));
  }
});

for(const table of tableNames) {
  test(`anonymous REST cannot read private ${table}`,async()=>{
    assertDenied(await cloud.request(fixtureQuery(table)));
  });
}

const bookingScopes={
  'owner-a':[1,3,4,5],'owner-b':[2],'customer-a':[1,3,4,5],'customer-b':[2],
  'advisor-a':[1,4,5],'advisor-b':[2],'technician-a':[1,5],'technician-b':[2],
  'unassigned-a':[],'parts-a':[1,5],'parts-b':[2],'qc-a':[1],'qc-b':[2],
  'qc-other-a':[1,5],'inactive-a':[],'outsider':[],
};
for(const [actor,visible] of Object.entries(bookingScopes)) {
  test(`${actor} reads only authorized Cloud bookings`,async()=>{
    assertIds(await read('bookings',actor),visible.map(n=>fixtureId(6,n)),actor);
  });
}

test('guessed foreign booking and customer URLs return zero rows',async()=>{
  for(const [actor,foreign] of [['advisor-a',2],['advisor-b',1],['customer-a',2],['customer-b',1],['unassigned-a',1]]) {
    const result=await cloud.requireSuccess(`/rest/v1/bookings?id=eq.${fixtureId(6,foreign)}&select=*`,{token:token(actor)});
    assert.deepEqual(result,[],actor);
  }
});

for(const [actor,tenants] of Object.entries({
  'owner-a':[1,3],'owner-b':[2],'customer-a':[1,3],'customer-b':[2],
  'advisor-a':[1],'advisor-b':[2],'technician-a':[1],'technician-b':[2],
  'parts-a':[1],'parts-b':[2],'qc-a':[1],'qc-b':[2],
  'unassigned-a':[],'inactive-a':[],'outsider':[],
})) {
  test(`${actor} is tenant-scoped across every booking child REST table`,async()=>{
    for(const table of privateChildren) {
      assertIds(await read(table,actor),tenants.map(n=>data[table][n-1].id),`${actor}/${table}`);
    }
  });
}

test('estimates expose sent snapshots while drafts remain authorized staff-only',async()=>{
  for(const actor of ['customer-a','parts-a','qc-a']) {
    const expected=actor==='customer-a'?[1,3]:[1];
    assertIds(await read('estimates',actor),expected.map(n=>fixtureId(9,n)),actor);
  }
  for(const actor of ['advisor-a','technician-a']) assertIds(await read('estimates',actor),[fixtureId(9,1),fixtureId(9,4)],actor);
  assertIds(await read('estimates','owner-a'),[fixtureId(9,1),fixtureId(9,3),fixtureId(9,4)]);
});

test('inventory and purchasing require active same-shop OWNER or PARTS',async()=>{
  for(const table of ['inventory_parts','purchase_orders','purchase_order_items']) {
    for(const [actor,tenants] of Object.entries({'owner-a':[1,3],'owner-b':[2],'parts-a':[1],'parts-b':[2],'advisor-a':[],'technician-a':[],'customer-a':[],'qc-a':[],'inactive-a':[]})) {
      assertIds(await read(table,actor),tenants.map(n=>data[table][n-1].id),`${actor}/${table}`);
    }
  }
});

test('profiles, vehicles and roster do not leak to unassigned or foreign staff',async()=>{
  assertIds(await read('profiles','customer-a'),[actors['customer-a'].id]);
  assertIds(await read('vehicles','customer-a'),[fixtureId(5,1)]);
  assertIds(await read('profiles','unassigned-a'),[actors['unassigned-a'].id]);
  assertIds(await read('vehicles','unassigned-a'),[]);
  assertIds(await read('vehicles','advisor-a'),[fixtureId(5,1)]);
  assertIds(await read('vehicles','advisor-b'),[fixtureId(5,2)]);
  const roster=await read('shop_memberships','advisor-a');
  assert.ok(roster.length>1);
  assert.ok(roster.every(row=>row.shop_id===fixtureId(1,1)));
  assertIds(await read('shop_memberships','inactive-a'),[]);
});

test('notifications are visible only to their intended customer',async()=>{
  assertIds(await read('notifications','customer-a'),[fixtureId(17,1),fixtureId(17,3)]);
  assertIds(await read('notifications','customer-b'),[fixtureId(17,2)]);
  for(const actor of ['advisor-a','owner-a','outsider']) assertIds(await read('notifications',actor),[]);
});

test('membership revocation takes effect with an existing user access token',async()=>{
  const membership=data.shop_memberships.find(row=>row.user_id===actors['technician-a'].id);
  const where=`id=${sqlLiteral(membership.id)} and shop_id=${sqlLiteral(fixtureId(1,1))}`;
  try {
    await cloud.query(`update public.shop_memberships set active=false where ${where}; select true as revoked;`);
    assertIds(await read('bookings','technician-a'),[]);
    assertIds(await read('estimate_items','technician-a'),[]);
  } finally {
    await cloud.query(`update public.shop_memberships set active=true where ${where}; select true as restored;`);
  }
  assertIds(await read('bookings','technician-a'),[fixtureId(6,1),fixtureId(6,5)]);
});

test('user-editable metadata cannot forge a shop role',async()=>{
  await cloud.requireSuccess('/auth/v1/user',{method:'PUT',token:token('outsider'),body:{data:{role:'OWNER',shop_id:fixtureId(1,1),user_id:actors['owner-a'].id}}});
  const session=await cloud.requireSuccess('/auth/v1/token?grant_type=refresh_token',{
    method:'POST',body:{refresh_token:actors.outsider.refreshToken},
  });
  actors.outsider.token=session.access_token;
  actors.outsider.refreshToken=session.refresh_token;
  assertIds(await read('bookings','outsider'),[]);
  assertIds(await read('inventory_parts','outsider'),[]);
});

test('private schema and helper RPCs cannot be invoked through the Data API',async()=>{
  const schema=await cloud.request('/rest/v1/shop_memberships?select=id',{token:token('advisor-a'),headers:{'Accept-Profile':'private'}});
  assert.equal(schema.status,406);
  for(const name of ['has_shop_role','can_read_booking','can_read_estimate','can_read_profile','can_read_vehicle','can_read_notification']) {
    const result=await cloud.request(`/rest/v1/rpc/${name}`,{method:'POST',token:token('advisor-a'),body:{}});
    assert.equal(result.status,404,name);
  }
});

for(const table of tableNames) {
  test(`authenticated REST INSERT/PATCH/DELETE are denied on ${table}`,async()=>{
    const original={...data[table][0]};
    const actor=table==='inventory_parts'?'parts-a':'owner-a';
    const headers={Prefer:'return=representation'};
    const inserted={...original,id:randomUUID()};
    for(const [method,path,body] of [
      ['POST',`/rest/v1/${table}`,inserted],
      ['PATCH',`/rest/v1/${table}?id=eq.${original.id}`,original],
      ['DELETE',`/rest/v1/${table}?id=eq.${original.id}`,undefined],
    ]) assertDenied(await cloud.request(path,{method,body,token:token(actor),headers}));
  });
}

test('foreign staff and customers cannot set status, stock or estimate approval',async()=>{
  for(const [actor,table,row,body] of [
    ['advisor-a','bookings',fixtureId(6,2),{status:'COMPLETED'}],
    ['customer-b','estimates',fixtureId(9,1),{state:'APPROVED'}],
    ['parts-a','inventory_parts',fixtureId(8,2),{quantity_on_hand:999}],
    ['outsider','shop_memberships',data.shop_memberships[0].id,{role:'OWNER',user_id:actors.outsider.id}],
  ]) assertDenied(await cloud.request(`/rest/v1/${table}?id=eq.${row}`,{method:'PATCH',body,token:token(actor)}));
});

test('denied REST mutations leave all fixture records unchanged',async()=>{
  for(const table of tableNames) {
    const rows=await cloud.requireSuccess(fixtureQuery(table),{admin:true});
    assert.equal(rows.length,data[table].length,table);
    const actual=new Map(rows.map(row=>[row.id,row]));
    for(const expected of data[table]) {
      const row=actual.get(expected.id);
      for(const [column,value] of Object.entries(expected)) {
        if(column.endsWith('_at') && typeof value==='string') assert.equal(Date.parse(row[column]),Date.parse(value),`${table}/${column}`);
        else assert.deepEqual(row[column],value,`${table}/${column}`);
      }
    }
  }
});

test('fixture tenant isolation is backed by matching-shop foreign keys',async()=>{
  const rows=await cloud.query(`select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
    from pg_constraint where contype='f' and connamespace='public'::regnamespace`);
  for(const table of ['bookings','booking_services','estimate_items','purchase_orders','purchase_order_items','part_allocations','qc_runs','qc_issues','booking_history','notifications']) {
    assert.ok(rows.some(row=>row.table_name===table && row.definition.includes('FOREIGN KEY (shop_id,')),table);
  }
  const versions=await cloud.query("select version from supabase_migrations.schema_migrations order by version");
  const expected=['20261009090000','20261009090100','20261009090200'];
  if(versions.some(row=>row.version==='20261009100642')) expected.push('20261009100642');
  if(versions.some(row=>row.version==='20261009121005')) expected.push('20261009121005');
  if(versions.some(row=>row.version==='20261009140203')) expected.push('20261009140203');
  if(versions.some(row=>row.version==='20261009151303')) expected.push('20261009151303');
  if(versions.some(row=>row.version==='20261009153959')) expected.push('20261009153959');
  if(versions.some(row=>row.version==='20261009161442')) expected.push('20261009161442');
  if(versions.some(row=>row.version==='20261009163309')) expected.push('20261009163309');
  if(versions.some(row=>row.version==='20261009180000')) expected.push('20261009180000');
  if(versions.some(row=>row.version==='20261009180100')) expected.push('20261009180100');
  assert.deepEqual(versions.map(row=>row.version),expected);
});

