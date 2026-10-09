-- Disposable local fixtures only. Never use --include-seed against a hosted project.
-- No workflow records are seeded in B01. Auth sign-in must be verified on the stack.
begin;

do $$
declare
  account record;
  account_id uuid;
begin
  for account in select * from (values
    (1, 'owner.a', 'Ayesha Khan'), (2, 'owner.b', 'Bilal Ahmed'),
    (3, 'customer.a', 'Sara Malik'), (4, 'customer.b', 'Omar Ali'),
    (11, 'advisor.a', 'Hamza Shah'), (12, 'technician.a', 'Usman Raza'),
    (13, 'parts.a', 'Zain Akhtar'), (14, 'qc.a', 'Hina Aslam'),
    (21, 'advisor.b', 'Nadia Iqbal'), (22, 'technician.b', 'Faisal Noor'),
    (23, 'parts.b', 'Hassan Tariq'), (24, 'qc.b', 'Maryam Javed'),
    (31, 'advisor.c', 'Ali Rauf'), (32, 'technician.c', 'Waqas Mir'),
    (33, 'parts.c', 'Saad Butt'), (34, 'qc.c', 'Sana Ashraf')
  ) as accounts(number, handle, full_name) loop
    account_id = ('10000000-0000-0000-0000-' || lpad(account.number::text, 12, '0'))::uuid;
    if exists (
      select 1 from auth.users
      where (email = account.handle || '@bayflow.example.test' and id <> account_id)
        or (id = account_id and email is distinct from account.handle || '@bayflow.example.test')
    ) then
      raise exception 'Seed identity conflicts with an existing account';
    end if;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', account_id, 'authenticated', 'authenticated',
      account.handle || '@bayflow.example.test',
      extensions.crypt('BayFlow-Local-2026!', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', account.full_name), now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      account_id, account_id, account_id::text,
      jsonb_build_object('sub', account_id::text, 'email', account.handle || '@bayflow.example.test', 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider_id, provider) do nothing;
    insert into public.profiles(id, full_name) values (account_id, account.full_name)
    on conflict (id) do nothing;
  end loop;
end;
$$;

insert into public.shops (id, owner_user_id, slug, name, city, address, phone, working_hours)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'lahore-auto-care', 'Lahore Auto Care', 'Lahore', '12 Main Boulevard, Gulberg', '+924235751001',
   '{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]],"sat":[["09:00","15:00"]],"sun":[]}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   'city-motors', 'City Motors', 'Lahore', '42 College Road, Township', '+924235751002',
   '{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]],"sat":[["09:00","15:00"]],"sun":[]}'::jsonb),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'northside-garage', 'Northside Garage', 'Islamabad', '8 Margalla Road, F-10', '+925123451003',
   '{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]],"sat":[["09:00","15:00"]],"sun":[]}'::jsonb)
on conflict (id) do nothing;

insert into public.shop_memberships(shop_id, user_id, role)
select id, owner_user_id, 'OWNER'::public.shop_role from public.shops
where id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003')
on conflict (shop_id, user_id) do nothing;

insert into public.shop_memberships(shop_id, user_id, role)
select ('20000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  ('10000000-0000-0000-0000-' || lpad((shop_number * 10 + roles.offset_number)::text, 12, '0'))::uuid,
  roles.role::public.shop_role
from generate_series(1, 3) shop_number
cross join (values (1,'SA'), (2,'TECHNICIAN'), (3,'PARTS'), (4,'QC')) roles(offset_number, role)
on conflict (shop_id, user_id) do nothing;

insert into public.services(id, shop_id, name, description, duration_minutes, base_price_pkr)
select ('30000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  'Brake inspection', 'Physical inspection of brakes and related symptoms.', 60, 1500
from generate_series(1, 3) shop_number
on conflict (id) do nothing;

-- Fixed fixtures, not a slot-generation workflow. These dates expire intentionally.
insert into public.appointment_slots(id, shop_id, starts_at, ends_at, capacity)
select ('40000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  '2026-10-12 09:00:00+05'::timestamptz, '2026-10-12 10:00:00+05'::timestamptz, 2
from generate_series(1, 3) shop_number
on conflict (id) do nothing;

insert into public.inventory_parts(id, shop_id, sku, name, quantity_on_hand, reorder_level, unit_cost_pkr)
select ('50000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(shop_number::text, 12, '0'))::uuid,
  'BRAKE-PAD-CIVIC', 'Honda Civic front brake pads', 4, 2, 6500
from generate_series(1, 3) shop_number
on conflict (id) do nothing;

insert into public.vehicles(id, customer_id, registration_plate, make, model, year)
values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'LEA-1234', 'Honda', 'Civic', 2016),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'ICT-5678', 'Toyota', 'Corolla', 2019)
on conflict (id) do nothing;

commit;
