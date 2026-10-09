begin;

-- B03: no table grants or policies change. Only these bounded operations write.
create function private.sync_profile_impl()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  display_name text;
  result public.profiles;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select case when jsonb_typeof(u.raw_user_meta_data -> 'full_name') = 'string'
    then nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 120), '') end
    into display_name from auth.users u where u.id = actor;
  if not found then raise exception 'Sign in required' using errcode = '42501'; end if;
  -- Name is display-only. Never derive role, tenant or ownership from user metadata.
  insert into public.profiles as p (id, full_name) values (actor, coalesce(display_name, 'BayFlow user'))
    on conflict (id) do update set full_name = coalesce(display_name, p.full_name)
    returning * into result;
  return jsonb_build_object('id', result.id, 'fullName', result.full_name, 'phone', result.phone);
end;
$$;

-- Hold the authoritative shop and owner-membership locks throughout each write.
create function private.require_team_owner(target_shop_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform 1 from public.shops s where s.id = target_shop_id and s.owner_user_id = auth.uid() for update;
  if not found then raise exception 'Shop owner required' using errcode = '42501'; end if;
  perform 1 from public.shop_memberships m where m.shop_id = target_shop_id
    and m.user_id = auth.uid() and m.role = 'OWNER' and m.active for update;
  if not found then raise exception 'Active owner required' using errcode = '42501'; end if;
end;
$$;

create function private.add_staff_membership_impl(target_shop_id uuid, target_user_id uuid, staff_role public.shop_role)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account auth.users;
  result public.shop_memberships;
  display_name text;
begin
  perform private.require_team_owner(target_shop_id);
  if staff_role is null or staff_role = 'OWNER' then
    raise exception 'A staff role is required' using errcode = '22023';
  end if;
  select * into account from auth.users u where u.id = target_user_id for update;
  -- Only a freshly Admin-provisioned identity for this exact owner/shop may join.
  -- User-editable metadata, arbitrary existing emails and client IDs confer no rights.
  if not found or account.raw_app_meta_data ->> 'bayflow_provisioned_by' is distinct from auth.uid()::text
    or account.raw_app_meta_data ->> 'bayflow_provisioned_shop' is distinct from target_shop_id::text then
    raise exception 'Owner-provisioned identity required' using errcode = '42501';
  end if;
  if exists (select 1 from public.shop_memberships m where m.user_id = target_user_id) then
    raise exception 'Existing account membership cannot be merged' using errcode = '23505';
  end if;
  display_name := case when jsonb_typeof(account.raw_user_meta_data -> 'full_name') = 'string'
    then nullif(left(btrim(account.raw_user_meta_data ->> 'full_name'), 120), '') end;
  insert into public.profiles (id, full_name) values (target_user_id, coalesce(display_name, 'BayFlow user'))
    on conflict (id) do nothing;
  insert into public.shop_memberships (shop_id, user_id, role)
    values (target_shop_id, target_user_id, staff_role) returning * into result;
  return jsonb_build_object('id', result.id, 'shopId', result.shop_id, 'userId', result.user_id,
    'role', result.role, 'active', result.active);
end;
$$;

create function private.edit_staff_membership_impl(target_shop_id uuid, target_member_id uuid,
  staff_role public.shop_role default null, is_active boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.shop_memberships;
begin
  perform private.require_team_owner(target_shop_id);
  if (staff_role is null and is_active is null) or staff_role = 'OWNER' then
    raise exception 'A staff role or active flag is required' using errcode = '22023';
  end if;
  select * into result from public.shop_memberships m
    where m.id = target_member_id and m.shop_id = target_shop_id for update;
  if not found then raise exception 'Membership not found' using errcode = 'P0002'; end if;
  if result.role = 'OWNER' or result.user_id = auth.uid() then
    raise exception 'Owner membership is protected' using errcode = '42501';
  end if;
  update public.shop_memberships m set role = coalesce(staff_role, m.role), active = coalesce(is_active, m.active)
    where m.id = result.id returning * into result;
  return jsonb_build_object('id', result.id, 'shopId', result.shop_id, 'userId', result.user_id,
    'role', result.role, 'active', result.active);
end;
$$;

create function public.sync_profile()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.sync_profile_impl();
$$;
create function public.add_staff_membership(target_shop_id uuid, target_user_id uuid, staff_role public.shop_role)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.add_staff_membership_impl(target_shop_id, target_user_id, staff_role);
$$;
create function public.edit_staff_membership(target_shop_id uuid, target_member_id uuid,
  staff_role public.shop_role default null, is_active boolean default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.edit_staff_membership_impl(target_shop_id, target_member_id, staff_role, is_active);
$$;

revoke all on function private.require_team_owner(uuid) from public, anon, authenticated;
revoke all on function private.sync_profile_impl(), private.add_staff_membership_impl(uuid, uuid, public.shop_role),
  private.edit_staff_membership_impl(uuid, uuid, public.shop_role, boolean) from public, anon, authenticated;
revoke all on function public.sync_profile(), public.add_staff_membership(uuid, uuid, public.shop_role),
  public.edit_staff_membership(uuid, uuid, public.shop_role, boolean) from public, anon, authenticated;
grant execute on function private.sync_profile_impl(), private.add_staff_membership_impl(uuid, uuid, public.shop_role),
  private.edit_staff_membership_impl(uuid, uuid, public.shop_role, boolean) to authenticated;
grant execute on function public.sync_profile(), public.add_staff_membership(uuid, uuid, public.shop_role),
  public.edit_staff_membership(uuid, uuid, public.shop_role, boolean) to authenticated;

commit;
