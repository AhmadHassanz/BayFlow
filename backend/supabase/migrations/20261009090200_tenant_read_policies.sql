begin;

-- Helpers accept a resource identifier, never a caller-supplied actor identity.
-- They bypass RLS only to evaluate bounded authorization predicates.
create function private.has_shop_role(target_shop_id uuid, allowed_roles public.shop_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = target_shop_id and m.user_id = (select auth.uid())
      and m.active and m.role = any(allowed_roles)
  );
$$;

create function private.can_read_booking(target_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = target_booking_id and (
      b.customer_id = (select auth.uid()) or exists (
        select 1 from public.shop_memberships m
        where m.shop_id = b.shop_id and m.user_id = (select auth.uid()) and m.active and (
          m.role in ('OWNER', 'SA')
          or (m.role = 'TECHNICIAN' and b.technician_user_id = m.user_id)
          or (m.role = 'PARTS' and b.parts_user_id = m.user_id)
          or (m.role = 'QC' and (
            (b.status = 'QC_PENDING' and b.qc_claimed_by is null)
            or b.qc_claimed_by = m.user_id
          ))
        )
      )
    )
  );
$$;

create function private.can_read_estimate(target_estimate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estimates e join public.bookings b on b.id = e.booking_id and b.shop_id = e.shop_id
    where e.id = target_estimate_id and private.can_read_booking(b.id) and (
      e.state in ('SENT', 'APPROVED', 'REJECTED')
      or private.has_shop_role(e.shop_id, array['OWNER','SA','TECHNICIAN']::public.shop_role[])
    )
  );
$$;

create function private.can_read_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_profile_id = (select auth.uid()) or exists (
    select 1 from public.bookings b
    where b.customer_id = target_profile_id and private.can_read_booking(b.id)
      and private.has_shop_role(b.shop_id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[])
  ) or exists (
    select 1 from public.shop_memberships m
    where m.user_id = target_profile_id
      and private.has_shop_role(m.shop_id, array['OWNER','SA']::public.shop_role[])
  );
$$;

create function private.can_read_vehicle(target_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicles v where v.id = target_vehicle_id and (
      v.customer_id = (select auth.uid()) or exists (
        select 1 from public.bookings b where b.vehicle_id = v.id and private.can_read_booking(b.id)
          and private.has_shop_role(b.shop_id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[])
      )
    )
  );
$$;

create function private.can_read_notification(target_shop_id uuid, target_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (target_shop_id is null and target_booking_id is null)
    or private.has_shop_role(target_shop_id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[])
    or exists (
      select 1 from public.bookings b
      where b.id = target_booking_id and b.shop_id = target_shop_id and b.customer_id = (select auth.uid())
    );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_shop_role(uuid, public.shop_role[]) to authenticated;
grant execute on function private.can_read_booking(uuid) to authenticated;
grant execute on function private.can_read_estimate(uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
grant execute on function private.can_read_vehicle(uuid) to authenticated;
grant execute on function private.can_read_notification(uuid, uuid) to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (private.can_read_profile(id));
create policy shops_member_read on public.shops for select to authenticated
  using (private.has_shop_role(id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[]));
create policy memberships_read on public.shop_memberships for select to authenticated
  using (
    (user_id = (select auth.uid()) and active)
    or private.has_shop_role(shop_id, array['OWNER','SA']::public.shop_role[])
  );
create policy services_member_read on public.services for select to authenticated
  using (private.has_shop_role(shop_id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[]));
create policy slots_member_read on public.appointment_slots for select to authenticated
  using (private.has_shop_role(shop_id, array['OWNER','SA','TECHNICIAN','PARTS','QC']::public.shop_role[]));
create policy vehicles_read on public.vehicles for select to authenticated
  using (private.can_read_vehicle(id));
create policy bookings_read on public.bookings for select to authenticated
  using (private.can_read_booking(id));
create policy booking_services_read on public.booking_services for select to authenticated
  using (private.can_read_booking(booking_id));
create policy estimates_read on public.estimates for select to authenticated
  using (private.can_read_estimate(id));
create policy estimate_items_read on public.estimate_items for select to authenticated
  using (private.can_read_estimate(estimate_id));
create policy inventory_read on public.inventory_parts for select to authenticated
  using (private.has_shop_role(shop_id, array['OWNER','PARTS']::public.shop_role[]));
create policy purchase_orders_read on public.purchase_orders for select to authenticated
  using (private.has_shop_role(shop_id, array['OWNER','PARTS']::public.shop_role[]));
create policy purchase_order_items_read on public.purchase_order_items for select to authenticated
  using (private.has_shop_role(shop_id, array['OWNER','PARTS']::public.shop_role[]));
create policy part_allocations_read on public.part_allocations for select to authenticated
  using (private.can_read_booking(booking_id));
create policy qc_runs_read on public.qc_runs for select to authenticated
  using (private.can_read_booking(booking_id));
create policy qc_issues_read on public.qc_issues for select to authenticated
  using (private.can_read_booking(booking_id));
create policy booking_history_read on public.booking_history for select to authenticated
  using (private.can_read_booking(booking_id));
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and private.can_read_notification(shop_id, booking_id));

grant select on public.profiles, public.shops, public.shop_memberships, public.services,
  public.appointment_slots, public.vehicles, public.bookings, public.booking_services,
  public.estimates, public.estimate_items, public.inventory_parts, public.purchase_orders,
  public.purchase_order_items, public.part_allocations, public.qc_runs, public.qc_issues,
  public.booking_history, public.notifications to authenticated;

-- Intentional definer projections: anon has no base-table privileges. These views
-- publish only explicit directory/catalog/schedule columns, filtered to active shops.
-- No bookings, occupancy, owner IDs, membership data or inventory are exposed.
create view public.public_shops with (security_barrier = true) as
  select id, slug, name, city, address, phone, working_hours, timezone,
    slot_duration_minutes, slot_capacity, logo_url
  from public.shops where active;
create view public.public_services with (security_barrier = true) as
  select s.id, s.shop_id, s.name, s.description, s.duration_minutes, s.base_price_pkr
  from public.services s join public.shops sh on sh.id = s.shop_id
  where s.active and sh.active;
create view public.public_appointment_slots with (security_barrier = true) as
  select s.id, s.shop_id, s.starts_at, s.ends_at, s.capacity
  from public.appointment_slots s join public.shops sh on sh.id = s.shop_id
  where sh.active and s.starts_at > now();
revoke all on public.public_shops, public.public_services, public.public_appointment_slots from public, anon, authenticated;
grant select on public.public_shops, public.public_services, public.public_appointment_slots to anon, authenticated;

-- Supabase service_role is exclusively server-side. It still cannot mutate history
-- through the immutable trigger; ordinary users receive no DML grants or policies.
grant all on all tables in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

commit;
