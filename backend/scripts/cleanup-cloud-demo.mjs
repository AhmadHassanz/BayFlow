import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const cliPath = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
export const marker = 'bayflow-demo-b11-v1';
export const shopIds = [
  'b1100000-0000-4000-8000-000000001001',
  'b1100000-0000-4000-8000-000000001002',
  'b1100000-0000-4000-8000-000000001003',
];

export function sqlLiteral(value) {
  if (typeof value !== 'string') throw new Error('Cleanup literals must be strings.');
  return `'${value.replaceAll("'", "''")}'`;
}
const targetShops = shopIds.map(sqlLiteral).join(',');

async function cli(args) {
  try {
    const result = await execute(process.execPath, [cliPath, ...args], {
      cwd: backend, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    const text = result.stdout.trim();
    try { return JSON.parse(text); } catch { /* CLI progress can precede JSON. */ }
    for (const token of ['\n{', '\n[']) {
      const start = text.indexOf(token);
      if (start >= 0) return JSON.parse(text.slice(start + 1));
    }
    throw new Error('No JSON result.');
  } catch {
    throw new Error(`Supabase CLI ${args[0]} ${args[1] ?? ''} failed. Check login/link without exposing credentials.`);
  }
}

async function query(sql) {
  const result = await cli(['db', 'query', '--linked', '--output', 'json', sql]);
  if (!Array.isArray(result.rows)) throw new Error('Unexpected Cloud query result.');
  return result.rows;
}

export function inventorySql() {
  return `with target_users as (
    select id from auth.users where raw_app_meta_data->>'bayflow_demo_fixture'=${sqlLiteral(marker)}
  ), target_bookings as (select id from public.bookings where shop_id in (${targetShops}))
  select 'auth_users' entity,(select count(*) from target_users)::integer total
  union all select 'shops',(select count(*) from public.shops where id in (${targetShops}))::integer
  union all select 'memberships',(select count(*) from public.shop_memberships where shop_id in (${targetShops}))::integer
  union all select 'services',(select count(*) from public.services where shop_id in (${targetShops}))::integer
  union all select 'slots',(select count(*) from public.appointment_slots where shop_id in (${targetShops}))::integer
  union all select 'inventory_parts',(select count(*) from public.inventory_parts where shop_id in (${targetShops}))::integer
  union all select 'vehicles',(select count(*) from public.vehicles where customer_id in (select id from target_users))::integer
  union all select 'bookings',(select count(*) from target_bookings)::integer
  union all select 'booking_services',(select count(*) from public.booking_services where shop_id in (${targetShops}))::integer
  union all select 'estimates',(select count(*) from public.estimates where shop_id in (${targetShops}))::integer
  union all select 'estimate_items',(select count(*) from public.estimate_items where shop_id in (${targetShops}))::integer
  union all select 'purchase_orders',(select count(*) from public.purchase_orders where shop_id in (${targetShops}))::integer
  union all select 'purchase_order_items',(select count(*) from public.purchase_order_items where shop_id in (${targetShops}))::integer
  union all select 'part_allocations',(select count(*) from public.part_allocations where shop_id in (${targetShops}))::integer
  union all select 'qc_runs',(select count(*) from public.qc_runs where shop_id in (${targetShops}))::integer
  union all select 'qc_issues',(select count(*) from public.qc_issues where shop_id in (${targetShops}))::integer
  union all select 'booking_history',(select count(*) from public.booking_history where shop_id in (${targetShops}))::integer
  union all select 'notifications',(select count(*) from public.notifications where shop_id in (${targetShops}) or user_id in (select id from target_users))::integer
  union all select 'booking_receipts',(select count(*) from private.booking_receipts where booking_id in (select id from target_bookings))::integer
  union all select 'booking_action_receipts',(select count(*) from private.booking_action_receipts where booking_id in (select id from target_bookings))::integer
  union all select 'identity_collisions',(select count(*) from public.shops s left join auth.users u on u.id=s.owner_user_id where s.id in (${targetShops}) and coalesce(u.raw_app_meta_data->>'bayflow_demo_fixture','')<>${sqlLiteral(marker)})::integer
  union all select 'external_dependencies',(
    (select count(*) from public.shop_memberships where user_id in (select id from target_users) and shop_id not in (${targetShops}))+
    (select count(*) from public.bookings where customer_id in (select id from target_users) and shop_id not in (${targetShops}))+
    (select count(*) from public.booking_history where actor_user_id in (select id from target_users) and shop_id not in (${targetShops}))+
    (select count(*) from public.shops where owner_user_id in (select id from target_users) and id not in (${targetShops}))
  )::integer order by entity`;
}

export function cleanupSql() {
  return `begin;
  do $$ begin
    if exists (select 1 from public.shops s left join auth.users u on u.id=s.owner_user_id where s.id in (${targetShops}) and coalesce(u.raw_app_meta_data->>'bayflow_demo_fixture','')<>${sqlLiteral(marker)}) then raise exception 'Fixture identity collision'; end if;
    if exists (with target_users as (select id from auth.users where raw_app_meta_data->>'bayflow_demo_fixture'=${sqlLiteral(marker)}) select 1 from public.shop_memberships where user_id in (select id from target_users) and shop_id not in (${targetShops}) union all select 1 from public.bookings where customer_id in (select id from target_users) and shop_id not in (${targetShops}) union all select 1 from public.booking_history where actor_user_id in (select id from target_users) and shop_id not in (${targetShops}) union all select 1 from public.shops where owner_user_id in (select id from target_users) and id not in (${targetShops})) then raise exception 'Marked user has an external dependency'; end if;
  end $$;
  create temporary table mt05_users on commit drop as select id from auth.users where raw_app_meta_data->>'bayflow_demo_fixture'=${sqlLiteral(marker)};
  create temporary table mt05_bookings on commit drop as select id from public.bookings where shop_id in (${targetShops});
  delete from public.notifications where shop_id in (${targetShops}) or user_id in (select id from mt05_users);
  delete from public.qc_issues where shop_id in (${targetShops});
  delete from public.qc_runs where shop_id in (${targetShops});
  delete from public.part_allocations where shop_id in (${targetShops});
  delete from public.purchase_order_items where shop_id in (${targetShops});
  delete from public.purchase_orders where shop_id in (${targetShops});
  delete from public.estimate_items where shop_id in (${targetShops});
  delete from public.estimates where shop_id in (${targetShops});
  delete from public.booking_services where shop_id in (${targetShops});
  delete from private.booking_action_receipts where booking_id in (select id from mt05_bookings);
  delete from private.booking_receipts where booking_id in (select id from mt05_bookings);
  alter table public.booking_history disable trigger booking_history_immutable;
  delete from public.booking_history where shop_id in (${targetShops});
  alter table public.booking_history enable trigger booking_history_immutable;
  delete from public.bookings where id in (select id from mt05_bookings);
  delete from public.inventory_parts where shop_id in (${targetShops});
  delete from public.services where shop_id in (${targetShops});
  delete from public.appointment_slots where shop_id in (${targetShops});
  delete from public.shop_memberships where shop_id in (${targetShops});
  delete from public.shops where id in (${targetShops});
  delete from public.vehicles where customer_id in (select id from mt05_users);
  delete from public.profiles where id in (select id from mt05_users);
  delete from auth.users where id in (select id from mt05_users);
  commit;
  select 'remaining_fixture_rows' entity, sum(total)::integer total from (${inventorySql()}) inventory where entity not in ('identity_collisions','external_dependencies');`;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const linkedRef = (await readFile(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim();
  const expectedRef = env.BAYFLOW_CLEANUP_PROJECT_REF;
  if (!expectedRef || linkedRef !== expectedRef) throw new Error('BAYFLOW_CLEANUP_PROJECT_REF must exactly match the linked project.');
  const before = await query(inventorySql());
  const blocked = before.filter(row => ['identity_collisions', 'external_dependencies'].includes(row.entity) && row.total !== 0);
  const executeCleanup = args.includes('--execute');
  if (!executeCleanup) { console.log(JSON.stringify({ dryRun: true, projectRef: linkedRef, marker, inventory: before })); return; }
  const confirmation = `DELETE ${marker} FROM ${linkedRef}`;
  if (env.BAYFLOW_CLEANUP_CONFIRM !== confirmation) throw new Error('BAYFLOW_CLEANUP_CONFIRM does not match the required project-specific confirmation.');
  if (blocked.length) throw new Error('Cleanup blocked by fixture collisions or external dependencies.');
  const after = await query(cleanupSql());
  console.log(JSON.stringify({ dryRun: false, projectRef: linkedRef, marker, result: after }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exitCode = 1; });
