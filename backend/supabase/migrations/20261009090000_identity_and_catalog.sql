begin;

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public, anon, authenticated;

create type public.shop_role as enum ('OWNER', 'SA', 'TECHNICIAN', 'PARTS', 'QC');
create type public.booking_status as enum (
  'PENDING', 'CONFIRMED', 'ASSIGNED', 'INSPECTING', 'ESTIMATE_REVIEW',
  'AWAITING_CUSTOMER', 'ESTIMATE_APPROVED', 'ESTIMATE_REJECTED',
  'PARTS_PENDING', 'PARTS_ORDERED', 'PARTS_READY', 'IN_REPAIR',
  'QC_PENDING', 'QC_IN_PROGRESS', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'
);
create type public.estimate_state as enum ('DRAFT', 'REVIEW', 'SENT', 'APPROVED', 'REJECTED');
create type public.estimate_item_kind as enum ('PART', 'LABOUR');
create type public.purchase_order_status as enum ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED');

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = pg_catalog.statement_timestamp();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  city text not null check (length(btrim(city)) > 0),
  address text not null check (length(btrim(address)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  working_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(working_hours) = 'object'),
  timezone text not null default 'Asia/Karachi' check (length(btrim(timezone)) > 0),
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes > 0),
  slot_capacity integer not null default 1 check (slot_capacity > 0),
  active boolean not null default true,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shops_owner_idx on public.shops(owner_user_id);
create index shops_public_city_idx on public.shops(city, name) where active;

create table public.shop_memberships (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.shop_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index shop_memberships_user_idx on public.shop_memberships(user_id, shop_id);
create index shop_memberships_role_idx on public.shop_memberships(shop_id, role) where active;

-- A single authoritative owner, also represented by an active OWNER membership.
-- Deferred checks permit atomic shop + owner-membership creation in a later RPC.
create function private.check_shop_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_shop_id uuid;
  target_owner_id uuid;
begin
  if tg_table_name = 'shops' then
    target_shop_id = new.id;
  elsif tg_op = 'DELETE' then
    target_shop_id = old.shop_id;
  else
    target_shop_id = new.shop_id;
    if tg_op = 'UPDATE' and old.shop_id <> new.shop_id then
      raise exception 'Membership shop is immutable' using errcode = '23514';
    end if;
  end if;
  select s.owner_user_id into target_owner_id from public.shops s where s.id = target_shop_id;
  if found and (
    not exists (
      select 1 from public.shop_memberships m
      where m.shop_id = target_shop_id and m.user_id = target_owner_id
        and m.role = 'OWNER' and m.active
    ) or exists (
      select 1 from public.shop_memberships m
      where m.shop_id = target_shop_id and m.role = 'OWNER' and m.user_id <> target_owner_id
    )
  ) then
    raise exception 'Shop owner must match its active OWNER membership' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function private.check_shop_owner() from public, anon, authenticated;
create constraint trigger shops_owner_membership
  after insert or update on public.shops deferrable initially deferred
  for each row execute function private.check_shop_owner();
create constraint trigger memberships_owner_consistency
  after insert or update or delete on public.shop_memberships deferrable initially deferred
  for each row execute function private.check_shop_owner();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  base_price_pkr integer check (base_price_pkr >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create index services_catalog_idx on public.services(shop_id, name) where active;

create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (shop_id, starts_at),
  unique (shop_id, id)
);

-- Vehicles are global customer assets; bookings bind them to a shop.
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  registration_plate text not null check (length(btrim(registration_plate)) > 0),
  make text not null check (length(btrim(make)) > 0),
  model text not null check (length(btrim(model)) > 0),
  year integer not null check (year between 1886 and 9999),
  color text,
  mileage integer check (mileage >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'shops', 'shop_memberships', 'services', 'appointment_slots', 'vehicles'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end;
$$;

commit;
