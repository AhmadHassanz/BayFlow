import { randomBytes } from 'node:crypto';
import { fixtureInsert, sqlLiteral } from './cloud-client.mjs';

export const fixtureId = (group, number) => `b0200000-0000-4000-8000-${String(group * 1000 + number).padStart(12, '0')}`;
export const actorNames = [
  'owner-a', 'owner-b', 'customer-a', 'customer-b', 'advisor-a', 'advisor-b',
  'technician-a', 'technician-b', 'unassigned-a', 'parts-a', 'parts-b',
  'qc-a', 'qc-b', 'qc-other-a', 'inactive-a', 'outsider',
];
const marker = 'bayflow-b02-rls-v1';

export async function provisionIdentities(cloud, actors) {
  const emails = actorNames.map((name) => `b02-${name}@bayflow.example.test`);
  const existing = await cloud.query(`select id,email,raw_app_meta_data from auth.users where email in (${emails.map(sqlLiteral).join(',')})`);
  for (const name of actorNames) {
    const email = `b02-${name}@bayflow.example.test`;
    const previous = existing.find((account) => account.email === email);
    if (previous && previous.raw_app_meta_data?.bayflow_test_fixture !== marker) {
      throw new Error(`Refusing to reuse an unmarked account for ${name}.`);
    }
    const password = `${randomBytes(32).toString('base64url')}!aA1`;
    const path = previous ? `/auth/v1/admin/users/${previous.id}` : '/auth/v1/admin/users';
    const account = await cloud.requireSuccess(path, {
      admin: true, method: previous ? 'PUT' : 'POST',
      body: { email, password, email_confirm: true, app_metadata: { bayflow_test_fixture: marker } },
    });
    // Capture identity immediately so finally cleanup can revoke partial-run sessions.
    actors[name] = { id: account.id, email };
    const session = await cloud.requireSuccess('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password },
    });
    if (session.user?.id !== account.id || !session.access_token) throw new Error(`Auth identity mismatch for ${name}.`);
    actors[name].token = session.access_token;
    actors[name].refreshToken = session.refresh_token;
  }
}

export function buildFixtures(actors) {
  const uid = (name) => actors[name].id;
  const nextDate = new Date(); nextDate.setUTCDate(nextDate.getUTCDate()+1);
  const date = nextDate.toISOString().slice(0,10);
  const workingHours = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]]));
  const shops = [1,2,3].map((number) => ({
    id: fixtureId(1,number), owner_user_id: uid(number === 2 ? 'owner-b' : 'owner-a'),
    slug: `b02-isolation-shop-${number}`, name: `B02 Isolation Test Shop ${number}`,
    city: 'Lahore', address: 'Disposable B02 security fixture', phone: '+920000000000', active: true,
    working_hours:workingHours,
  }));
  const memberships = [];
  const member = (name, shopNumber, role, active = true) => memberships.push({
    id: fixtureId(2,memberships.length+1), shop_id: fixtureId(1,shopNumber), user_id: uid(name), role, active,
  });
  member('owner-a',1,'OWNER'); member('owner-b',2,'OWNER'); member('owner-a',3,'OWNER');
  for (const [name,role] of [['advisor','SA'],['technician','TECHNICIAN'],['parts','PARTS'],['qc','QC']]) {
    member(`${name}-a`,1,role); member(`${name}-b`,2,role);
  }
  member('unassigned-a',1,'TECHNICIAN'); member('qc-other-a',1,'QC'); member('inactive-a',1,'SA',false);
  const services = [1,2,3].map((n) => ({ id:fixtureId(3,n),shop_id:fixtureId(1,n),name:'B02 Test Inspection',duration_minutes:60,active:true }));
  const slots = [1,2,3].map((n) => ({ id:fixtureId(4,n),shop_id:fixtureId(1,n),starts_at:`${date}T04:00:00Z`,ends_at:`${date}T05:00:00Z`,capacity:10 }));
  const vehicles = [1,2].map((n) => ({ id:fixtureId(5,n),customer_id:uid(`customer-${n===1?'a':'b'}`),registration_plate:`B02-TEST-${n}`,make:'Honda',model:'Civic',year:2016 }));
  const bookings = [1,2,3,4,5].map((n) => {
    const tenant=n<=3?n:1;
    return {
      id:fixtureId(6,n),shop_id:fixtureId(1,tenant),customer_id:uid(tenant===2?'customer-b':'customer-a'),
      vehicle_id:fixtureId(5,tenant===2?2:1),slot_id:fixtureId(4,tenant),
      status:n===5?'QC_IN_PROGRESS':n===4||n===3?'PENDING':'QC_PENDING',
      technician_user_id:tenant===3||n===4?null:uid(tenant===2?'technician-b':'technician-a'),
      parts_user_id:tenant===3||n===4?null:uid(tenant===2?'parts-b':'parts-a'),
      qc_claimed_by:n===5?uid('qc-other-a'):null, notes:'B02 security fixture; not a workflow execution', state_version:0,
    };
  });
  const perShop = (group, build) => [1,2,3].map((n) => ({ id:fixtureId(group,n),shop_id:fixtureId(1,n),...build(n) }));
  const data = {
    profiles:Object.entries(actors).map(([name,actor])=>({id:actor.id,full_name:`B02 ${name}`})), shops, shop_memberships:memberships,
    services, appointment_slots:slots, vehicles, bookings,
    booking_services:perShop(7,n=>({booking_id:fixtureId(6,n),service_id:fixtureId(3,n)})),
    inventory_parts:perShop(8,()=>({sku:'B02-TEST-PART',name:'B02 test brake pads',quantity_on_hand:4,reorder_level:1,unit_cost_pkr:6500})),
    estimates:perShop(9,n=>({booking_id:fixtureId(6,n),revision_no:1,state:'SENT',subtotal_pkr:6500,sent_at:'2099-01-01T00:00:00Z'})),
    estimate_items:perShop(10,n=>({estimate_id:fixtureId(9,n),kind:'PART',part_id:fixtureId(8,n),description_snapshot:'B02 test brake pads',quantity:1,unit_price_pkr:6500})),
    purchase_orders:perShop(11,n=>({booking_id:fixtureId(6,n),created_by:uid(n===2?'parts-b':n===1?'parts-a':'owner-a')})),
    purchase_order_items:perShop(12,n=>({purchase_order_id:fixtureId(11,n),part_id:fixtureId(8,n),quantity_ordered:2})),
    part_allocations:perShop(13,n=>({booking_id:fixtureId(6,n),part_id:fixtureId(8,n),quantity:1,allocated_by:uid(n===2?'parts-b':n===1?'parts-a':'owner-a')})),
    qc_runs:perShop(14,n=>({booking_id:fixtureId(6,n),inspector_user_id:uid(n===2?'qc-b':n===1?'qc-a':'owner-a')})),
    qc_issues:perShop(15,n=>({booking_id:fixtureId(6,n),qc_run_id:fixtureId(14,n),reported_by:uid(n===2?'qc-b':n===1?'qc-a':'owner-a'),title:'B02 test issue',description:'Security fixture only'})),
    booking_history:perShop(16,n=>({booking_id:fixtureId(6,n),actor_user_id:uid(n===2?'advisor-b':'owner-a'),to_status:n===3?'PENDING':'QC_PENDING',action:'B02_SECURITY_FIXTURE'})),
    notifications:perShop(17,n=>({booking_id:fixtureId(6,n),user_id:uid(n===2?'customer-b':'customer-a'),type:'B02_SECURITY_FIXTURE',title:'B02 test notice',message:'Security fixture only'})),
  };
  data.estimates.push({id:fixtureId(9,4),shop_id:fixtureId(1,1),booking_id:fixtureId(6,1),revision_no:2,state:'DRAFT',subtotal_pkr:0,sent_at:null});
  return data;
}

export async function provisionRows(cloud, data) {
  const existing = await cloud.query(`select id,slug,owner_user_id from public.shops where id in (${data.shops.map(row=>sqlLiteral(row.id)).join(',')})`);
  for (const previous of existing) {
    const expected=data.shops.find(row=>row.id===previous.id);
    if (previous.slug!==expected.slug || previous.owner_user_id!==expected.owner_user_id) throw new Error('Fixture shop identity collision; refusing to overwrite.');
  }
  const sql=Object.entries(data).map(([table,rows])=>fixtureInsert(table,rows,{immutable:table==='booking_history'})).join('\n');
  await cloud.query(`begin;\n${sql}\ncommit; select true as fixtures_ready;`);
}

export async function deactivateFixtures(cloud, actors, data) {
  const errors=[];
  if (data && Object.keys(actors).length===actorNames.length) {
    const shops=data.shops.map(row=>sqlLiteral(row.id)).join(',');
    const users=Object.values(actors).map(actor=>sqlLiteral(actor.id)).join(',');
    try {
      const result=await cloud.query(`begin;
        update public.shop_memberships set active=false where shop_id in (${shops}) and role<>'OWNER' and user_id in (${users});
        update public.shops set active=false where id in (${shops}) and owner_user_id in (${users});
        commit;
        select (select count(*)::integer from public.shops where id in (${shops}) and active) as active_shops,
          (select count(*)::integer from public.shop_memberships where shop_id in (${shops}) and role<>'OWNER' and active) as active_staff;`);
      if(result[0]?.active_shops!==0 || result[0]?.active_staff!==0) throw new Error('Fixture deactivation was incomplete.');
    } catch(error) { errors.push(error); }
  }
  for (const actor of Object.values(actors)) {
    if(actor.token) {
      try { await cloud.requireSuccess('/auth/v1/logout?scope=global',{method:'POST',token:actor.token}); }
      catch(error) { errors.push(error); }
    }
  }
  if(errors.length) throw new AggregateError(errors,'B02 fixture cleanup was incomplete; rerun cleanup before using this project.');
}
