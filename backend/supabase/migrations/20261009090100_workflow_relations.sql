begin;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  vehicle_id uuid not null,
  slot_id uuid not null,
  status public.booking_status not null default 'PENDING',
  technician_user_id uuid,
  parts_user_id uuid,
  qc_claimed_by uuid,
  state_version integer not null default 0 check (state_version >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (customer_id, vehicle_id) references public.vehicles(customer_id, id) on delete restrict,
  foreign key (shop_id, slot_id) references public.appointment_slots(shop_id, id) on delete restrict,
  foreign key (shop_id, technician_user_id) references public.shop_memberships(shop_id, user_id) on delete restrict,
  foreign key (shop_id, parts_user_id) references public.shop_memberships(shop_id, user_id) on delete restrict,
  foreign key (shop_id, qc_claimed_by) references public.shop_memberships(shop_id, user_id) on delete restrict,
  check ((status = 'COMPLETED') = (completed_at is not null)),
  check (completed_at is null or completed_at >= created_at),
  unique (shop_id, id)
);
create index bookings_shop_status_idx on public.bookings(shop_id, status, created_at desc);
create index bookings_customer_idx on public.bookings(customer_id, created_at desc);
create index bookings_technician_idx on public.bookings(technician_user_id, status) where technician_user_id is not null;
create index bookings_parts_idx on public.bookings(parts_user_id, status) where parts_user_id is not null;
create index bookings_qc_idx on public.bookings(qc_claimed_by, status) where qc_claimed_by is not null;
create index bookings_slot_idx on public.bookings(shop_id, slot_id) where status <> 'CANCELLED';
create index bookings_vehicle_idx on public.bookings(customer_id, vehicle_id);

create table public.booking_services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  foreign key (shop_id, service_id) references public.services(shop_id, id) on delete restrict,
  unique (booking_id, service_id)
);
create index booking_services_booking_idx on public.booking_services(shop_id, booking_id);
create index booking_services_service_idx on public.booking_services(shop_id, service_id);

create table public.inventory_parts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  sku text not null check (length(btrim(sku)) > 0),
  name text not null check (length(btrim(name)) > 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  unit_cost_pkr integer not null check (unit_cost_pkr >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, sku),
  unique (shop_id, id)
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  state public.estimate_state not null default 'DRAFT',
  diagnosis_note text not null default '',
  subtotal_pkr integer not null default 0 check (subtotal_pkr >= 0),
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  unique (booking_id, revision_no),
  unique (shop_id, id),
  check ((state in ('SENT', 'APPROVED', 'REJECTED')) = (sent_at is not null)),
  check ((state in ('APPROVED', 'REJECTED')) = (decided_at is not null)),
  check (sent_at is null or sent_at >= created_at),
  check (decided_at is null or decided_at >= sent_at)
);
create index estimates_booking_idx on public.estimates(shop_id, booking_id, revision_no desc);

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  estimate_id uuid not null,
  kind public.estimate_item_kind not null,
  part_id uuid,
  description_snapshot text not null check (length(btrim(description_snapshot)) > 0),
  quantity integer not null check (quantity > 0),
  unit_price_pkr integer not null check (unit_price_pkr >= 0),
  line_total_pkr integer generated always as (quantity * unit_price_pkr) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, estimate_id) references public.estimates(shop_id, id) on delete restrict,
  foreign key (shop_id, part_id) references public.inventory_parts(shop_id, id) on delete restrict,
  check ((kind = 'PART' and part_id is not null) or (kind = 'LABOUR' and part_id is null))
);
create index estimate_items_estimate_idx on public.estimate_items(shop_id, estimate_id);
create index estimate_items_part_idx on public.estimate_items(shop_id, part_id) where part_id is not null;

-- A deferred invariant checks totals after a future transaction finishes its writes.
-- It validates trusted item totals without implementing estimate workflow actions.
create function private.check_estimate_subtotal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
begin
  if tg_table_name = 'estimates' then
    target_id = new.id;
  elsif tg_op = 'DELETE' then
    target_id = old.estimate_id;
  else
    target_id = new.estimate_id;
    if tg_op = 'UPDATE' and (old.estimate_id, old.shop_id) is distinct from (new.estimate_id, new.shop_id) then
      raise exception 'Estimate item parent is immutable' using errcode = '23514';
    end if;
  end if;
  if exists (
    select 1 from public.estimates e
    where e.id = target_id and e.subtotal_pkr::bigint <> (
      select coalesce(sum(i.line_total_pkr), 0) from public.estimate_items i where i.estimate_id = target_id
    )
  ) then
    raise exception 'Estimate subtotal must equal the sum of its item totals' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function private.check_estimate_subtotal() from public, anon, authenticated;
create constraint trigger estimates_subtotal
  after insert or update on public.estimates deferrable initially deferred
  for each row execute function private.check_estimate_subtotal();
create constraint trigger estimate_items_subtotal
  after insert or update or delete on public.estimate_items deferrable initially deferred
  for each row execute function private.check_estimate_subtotal();

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid,
  created_by uuid not null,
  status public.purchase_order_status not null default 'ORDERED',
  supplier_name text,
  ordered_at timestamptz not null default now(),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  foreign key (shop_id, created_by) references public.shop_memberships(shop_id, user_id) on delete restrict,
  check ((status = 'RECEIVED') = (received_at is not null)),
  check (received_at is null or received_at >= ordered_at),
  unique (shop_id, id)
);
create index purchase_orders_booking_idx on public.purchase_orders(shop_id, booking_id);
create index purchase_orders_created_by_idx on public.purchase_orders(shop_id, created_by);
create index purchase_orders_status_idx on public.purchase_orders(shop_id, status, ordered_at desc);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  purchase_order_id uuid not null,
  part_id uuid not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, purchase_order_id) references public.purchase_orders(shop_id, id) on delete restrict,
  foreign key (shop_id, part_id) references public.inventory_parts(shop_id, id) on delete restrict,
  unique (purchase_order_id, part_id)
);
create index purchase_order_items_order_idx on public.purchase_order_items(shop_id, purchase_order_id);
create index purchase_order_items_part_idx on public.purchase_order_items(shop_id, part_id);

create table public.part_allocations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  part_id uuid not null,
  quantity integer not null check (quantity > 0),
  allocated_by uuid not null,
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  foreign key (shop_id, part_id) references public.inventory_parts(shop_id, id) on delete restrict,
  foreign key (shop_id, allocated_by) references public.shop_memberships(shop_id, user_id) on delete restrict,
  check (released_at is null or released_at >= allocated_at)
);
create unique index part_allocations_active_unique on public.part_allocations(booking_id, part_id) where released_at is null;
create index part_allocations_booking_idx on public.part_allocations(shop_id, booking_id);
create index part_allocations_part_idx on public.part_allocations(shop_id, part_id);
create index part_allocations_actor_idx on public.part_allocations(shop_id, allocated_by);

create table public.qc_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  inspector_user_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  passed boolean,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  foreign key (shop_id, inspector_user_id) references public.shop_memberships(shop_id, user_id) on delete restrict,
  unique (shop_id, booking_id, id),
  check ((finished_at is null) = (passed is null)),
  check (finished_at is null or finished_at >= started_at)
);
create unique index qc_runs_one_open_idx on public.qc_runs(booking_id) where finished_at is null;
create index qc_runs_booking_idx on public.qc_runs(shop_id, booking_id, started_at desc);
create index qc_runs_inspector_idx on public.qc_runs(shop_id, inspector_user_id);

create table public.qc_issues (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  qc_run_id uuid not null,
  reported_by uuid not null,
  title text not null check (length(btrim(title)) > 0),
  description text not null check (length(btrim(description)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  foreign key (shop_id, booking_id, qc_run_id) references public.qc_runs(shop_id, booking_id, id) on delete restrict,
  foreign key (shop_id, reported_by) references public.shop_memberships(shop_id, user_id) on delete restrict,
  check (resolved_at is null or resolved_at >= created_at)
);
create index qc_issues_booking_idx on public.qc_issues(shop_id, booking_id);
create index qc_issues_run_idx on public.qc_issues(shop_id, booking_id, qc_run_id);
create index qc_issues_reporter_idx on public.qc_issues(shop_id, reported_by);

create table public.booking_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  booking_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  from_status public.booking_status,
  to_status public.booking_status not null,
  action text not null check (length(btrim(action)) > 0),
  note text,
  created_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict
);
create index booking_history_booking_idx on public.booking_history(booking_id, created_at, id);
create index booking_history_shop_idx on public.booking_history(shop_id, booking_id);
create index booking_history_actor_idx on public.booking_history(actor_user_id);

create function private.reject_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Booking history is append-only' using errcode = '23514';
end;
$$;
revoke all on function private.reject_history_mutation() from public, anon, authenticated;
create trigger booking_history_immutable before update or delete on public.booking_history
  for each row execute function private.reject_history_mutation();
create trigger booking_history_no_truncate before truncate on public.booking_history
  for each statement execute function private.reject_history_mutation();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete restrict,
  booking_id uuid,
  type text not null check (length(btrim(type)) > 0),
  title text not null check (length(btrim(title)) > 0),
  message text not null check (length(btrim(message)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (shop_id, booking_id) references public.bookings(shop_id, id) on delete restrict,
  check (booking_id is null or shop_id is not null),
  check (read_at is null or read_at >= created_at)
);
create index notifications_recipient_idx on public.notifications(user_id, read_at, created_at desc);
create index notifications_booking_idx on public.notifications(shop_id, booking_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'bookings', 'booking_services', 'inventory_parts', 'estimates', 'estimate_items',
    'purchase_orders', 'purchase_order_items', 'part_allocations', 'qc_runs',
    'qc_issues', 'booking_history', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    if table_name not in ('booking_services', 'booking_history', 'notifications') then
      execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
    end if;
  end loop;
end;
$$;

commit;
