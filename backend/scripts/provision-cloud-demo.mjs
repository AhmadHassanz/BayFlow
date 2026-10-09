import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const cliPath = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
const marker = 'bayflow-demo-b11-v1';
const dryRun = process.argv.includes('--dry-run');

const ids = {
  shops: [
    'b1100000-0000-4000-8000-000000001001',
    'b1100000-0000-4000-8000-000000001002',
    'b1100000-0000-4000-8000-000000001003',
  ],
  services: [
    'b1100000-0000-4000-8000-000000003001',
    'b1100000-0000-4000-8000-000000003002',
    'b1100000-0000-4000-8000-000000003003',
  ],
  slots: [
    'b1100000-0000-4000-8000-000000004001',
    'b1100000-0000-4000-8000-000000004002',
    'b1100000-0000-4000-8000-000000004003',
  ],
  inventory: [
    'b1100000-0000-4000-8000-000000005001',
    'b1100000-0000-4000-8000-000000005002',
    'b1100000-0000-4000-8000-000000005003',
  ],
  vehicles: [
    'b1100000-0000-4000-8000-000000006001',
    'b1100000-0000-4000-8000-000000006002',
  ],
};

const accounts = [
  ['owner.a', 'Ayesha Khan'], ['owner.b', 'Bilal Ahmed'],
  ['customer.a', 'Sara Malik'], ['customer.b', 'Omar Ali'],
  ['advisor.a', 'Hamza Shah'], ['technician.a', 'Usman Raza'], ['parts.a', 'Zain Akhtar'], ['qc.a', 'Hina Aslam'],
  ['advisor.b', 'Nadia Iqbal'], ['technician.b', 'Faisal Noor'], ['parts.b', 'Hassan Tariq'], ['qc.b', 'Maryam Javed'],
  ['advisor.c', 'Ali Rauf'], ['technician.c', 'Waqas Mir'], ['parts.c', 'Saad Butt'], ['qc.c', 'Sana Ashraf'],
].map(([handle, fullName]) => ({ handle, email: `demo-${handle}@bayflow.example.test`, fullName }));

const shopDefinitions = [
  { index: 0, slug: 'demo-lahore-auto-care', name: 'Lahore Auto Care', city: 'Lahore', address: '12 Main Boulevard, Gulberg', phone: '+924235751001', owner: 'owner.a' },
  { index: 1, slug: 'demo-city-motors', name: 'City Motors', city: 'Lahore', address: '42 College Road, Township', phone: '+924235751002', owner: 'owner.b' },
  { index: 2, slug: 'demo-northside-garage', name: 'Northside Garage', city: 'Islamabad', address: '8 Margalla Road, F-10', phone: '+925123451003', owner: 'owner.a' },
];
const roleGroups = [
  { suffix: 'a', shopIndex: 0 },
  { suffix: 'b', shopIndex: 1 },
  { suffix: 'c', shopIndex: 2 },
];
const workingHours = { mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [['09:00', '15:00']], sun: [] };

function parseCliJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('Empty Supabase CLI output.');
  try { return JSON.parse(trimmed); } catch { /* progress may precede JSON */ }
  for (const marker of ['\n{', '\n[']) {
    const index = trimmed.indexOf(marker);
    if (index >= 0) return JSON.parse(trimmed.slice(index + 1));
  }
  throw new Error('Unparseable Supabase CLI JSON output.');
}

async function cli(args) {
  try {
    const result = await execute(process.execPath, [cliPath, ...args], {
      cwd: backend, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    return parseCliJson(result.stdout);
  } catch (error) {
    throw new Error(`Supabase CLI ${args[0]} ${args[1] ?? ''} failed. Check login/link without exposing secrets.`);
  }
}

function sqlLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value && typeof value === 'object') return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
  if (typeof value !== 'string') throw new Error('Unsupported SQL literal value.');
  return `'${value.replaceAll("'", "''")}'`;
}

function nextDemoSlot() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0));
  date.setUTCDate(date.getUTCDate() + 2);
  return {
    startsAt: date.toISOString().replace('.000Z', '+00:00'),
    endsAt: new Date(date.getTime() + 60 * 60000).toISOString().replace('.000Z', '+00:00'),
  };
}

async function request(baseUrl, publicKey, adminKey, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!response.ok) throw new Error(`Supabase Admin request failed for ${method} ${path} with HTTP ${response.status}.`);
  return data;
}

async function query(sql) {
  const result = await cli(['db', 'query', '--linked', '--output', 'json', sql]);
  if (!Array.isArray(result.rows)) throw new Error('Unexpected SQL query result.');
  return result.rows;
}

async function signIn(baseUrl, publicKey, email, password) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!response.ok || !data?.access_token || !data?.user?.id) throw new Error(`Demo sign-in failed for ${email}.`);
  return data.user.id;
}

async function main() {
  const linkedRef = (await readFile(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim();
  const expectedRef = process.env.BAYFLOW_DEMO_PROJECT_REF ?? linkedRef;
  if (linkedRef !== expectedRef) throw new Error('Linked project does not match BAYFLOW_DEMO_PROJECT_REF.');
  const password = process.env.BAYFLOW_DEMO_PASSWORD;
  if (!dryRun && (!password || password.length < 12 || password.length > 128)) {
    throw new Error('Set BAYFLOW_DEMO_PASSWORD to a 12-128 character demo password before provisioning.');
  }
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, projectRef: linkedRef, marker, accounts: accounts.map(a => a.email), shops: shopDefinitions.map(s => s.slug) }));
    return;
  }

  const versions = await query('select version from supabase_migrations.schema_migrations order by version');
  if (!versions.some(row => row.version === '20261010100000')) throw new Error('B10 migration must be applied before B11 demo provisioning.');
  const keys = await cli(['projects', 'api-keys', '--project-ref', linkedRef, '--reveal', '--output', 'json']);
  const publicKey = keys.find(key => key.type === 'publishable')?.api_key ?? keys.find(key => key.name === 'anon')?.api_key;
  const adminKey = keys.find(key => key.name === 'service_role')?.api_key ?? keys.find(key => key.type === 'secret')?.api_key;
  if (!publicKey || !adminKey) throw new Error('Required Cloud project keys are unavailable to the signed-in CLI account.');
  const baseUrl = `https://${linkedRef}.supabase.co`;

  const existing = await query(`select id,email,raw_app_meta_data from auth.users where email in (${accounts.map(a => sqlLiteral(a.email)).join(',')})`);
  const actors = new Map();
  for (const account of accounts) {
    const previous = existing.find(row => row.email === account.email);
    if (previous && previous.raw_app_meta_data?.bayflow_demo_fixture !== marker) {
      throw new Error(`Refusing to reuse unmarked demo account ${account.email}.`);
    }
    const body = { email: account.email, password, email_confirm: true, user_metadata: { full_name: account.fullName }, app_metadata: { bayflow_demo_fixture: marker } };
    const created = await request(baseUrl, publicKey, adminKey, previous ? `/auth/v1/admin/users/${previous.id}` : '/auth/v1/admin/users', {
      method: previous ? 'PUT' : 'POST', body,
    });
    actors.set(account.handle, created.id);
  }

  let loginVerified = 0;
  for (const account of accounts) {
    const signedInId = await signIn(baseUrl, publicKey, account.email, password);
    if (signedInId !== actors.get(account.handle)) throw new Error(`Demo sign-in identity mismatch for ${account.email}.`);
    loginVerified += 1;
  }

  const slot = nextDemoSlot();
  const values = [];
  for (const account of accounts) values.push(`(${sqlLiteral(actors.get(account.handle))},${sqlLiteral(account.fullName)})`);
  const shopsSql = shopDefinitions.map(shop => `(${sqlLiteral(ids.shops[shop.index])},${sqlLiteral(actors.get(shop.owner))},${sqlLiteral(shop.slug)},${sqlLiteral(shop.name)},${sqlLiteral(shop.city)},${sqlLiteral(shop.address)},${sqlLiteral(shop.phone)},${sqlLiteral(workingHours)},true)`).join(',');
  const ownerMemberships = shopDefinitions.map(shop => `(${sqlLiteral(ids.shops[shop.index])},${sqlLiteral(actors.get(shop.owner))},'OWNER',true)`).join(',');
  const staffMemberships = roleGroups.flatMap(group => [
    ['advisor', 'SA'], ['technician', 'TECHNICIAN'], ['parts', 'PARTS'], ['qc', 'QC'],
  ].map(([roleHandle, role]) => `(${sqlLiteral(ids.shops[group.shopIndex])},${sqlLiteral(actors.get(`${roleHandle}.${group.suffix}`))},'${role}',true)`)).join(',');
  const servicesSql = shopDefinitions.map(shop => `(${sqlLiteral(ids.services[shop.index])},${sqlLiteral(ids.shops[shop.index])},'Brake inspection','Physical inspection of brakes and related symptoms.',60,1500,true)`).join(',');
  const slotsSql = shopDefinitions.map(shop => `(${sqlLiteral(ids.slots[shop.index])},${sqlLiteral(ids.shops[shop.index])},${sqlLiteral(slot.startsAt)}::timestamptz,${sqlLiteral(slot.endsAt)}::timestamptz,3)`).join(',');
  const inventorySql = shopDefinitions.map(shop => `(${sqlLiteral(ids.inventory[shop.index])},${sqlLiteral(ids.shops[shop.index])},'BRAKE-PAD-CIVIC','Honda Civic front brake pads',6,2,6500,true)`).join(',');
  const vehiclesSql = [
    `(${sqlLiteral(ids.vehicles[0])},${sqlLiteral(actors.get('customer.a'))},'LEA-1234','Honda','Civic',2016,'Silver',65000)`,
    `(${sqlLiteral(ids.vehicles[1])},${sqlLiteral(actors.get('customer.b'))},'ICT-5678','Toyota','Corolla',2019,'White',42000)`,
  ].join(',');

  await query(`begin;
    insert into public.profiles(id,full_name) values ${values.join(',')} on conflict (id) do update set full_name=excluded.full_name;
    insert into public.shops(id,owner_user_id,slug,name,city,address,phone,working_hours,active) values ${shopsSql}
      on conflict (id) do update set owner_user_id=excluded.owner_user_id, slug=excluded.slug, name=excluded.name, city=excluded.city, address=excluded.address, phone=excluded.phone, working_hours=excluded.working_hours, active=true;
    insert into public.shop_memberships(shop_id,user_id,role,active) values ${ownerMemberships},${staffMemberships}
      on conflict (shop_id,user_id) do update set role=excluded.role, active=true;
    insert into public.services(id,shop_id,name,description,duration_minutes,base_price_pkr,active) values ${servicesSql}
      on conflict (id) do update set name=excluded.name, description=excluded.description, duration_minutes=excluded.duration_minutes, base_price_pkr=excluded.base_price_pkr, active=true;
    insert into public.appointment_slots(id,shop_id,starts_at,ends_at,capacity) values ${slotsSql}
      on conflict (id) do update set starts_at=excluded.starts_at, ends_at=excluded.ends_at, capacity=excluded.capacity;
    insert into public.inventory_parts(id,shop_id,sku,name,quantity_on_hand,reorder_level,unit_cost_pkr,active) values ${inventorySql}
      on conflict (id) do update set name=excluded.name, reorder_level=excluded.reorder_level, unit_cost_pkr=excluded.unit_cost_pkr, active=true;
    insert into public.vehicles(id,customer_id,registration_plate,make,model,year,color,mileage) values ${vehiclesSql}
      on conflict (id) do update set registration_plate=excluded.registration_plate, make=excluded.make, model=excluded.model, year=excluded.year, color=excluded.color, mileage=excluded.mileage;
    commit;
    select true as b11_demo_ready;`);

  const counts = await query(`select
    (select count(*)::integer from auth.users where raw_app_meta_data->>'bayflow_demo_fixture'=${sqlLiteral(marker)}) users,
    (select count(*)::integer from public.shops where id in (${ids.shops.map(sqlLiteral).join(',')}) and active) shops,
    (select count(*)::integer from public.shop_memberships where shop_id in (${ids.shops.map(sqlLiteral).join(',')}) and active) memberships,
    (select count(*)::integer from public.services where id in (${ids.services.map(sqlLiteral).join(',')}) and active) services,
    (select count(*)::integer from public.appointment_slots where id in (${ids.slots.map(sqlLiteral).join(',')}) and starts_at > now()) future_slots,
    (select count(*)::integer from public.inventory_parts where id in (${ids.inventory.map(sqlLiteral).join(',')}) and active) inventory_parts,
    (select count(*)::integer from public.vehicles where id in (${ids.vehicles.map(sqlLiteral).join(',')})) vehicles`);
  console.log(JSON.stringify({ projectRef: linkedRef, marker, ...counts[0], accounts: accounts.map(a => a.email), loginVerified, password: 'not printed' }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
