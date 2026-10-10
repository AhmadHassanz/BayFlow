begin;

create function private.enforce_shop_publication_readiness()
returns trigger language plpgsql security definer set search_path = '' as $$
declare missing text[] := array[]::text[];
begin
  if new.active and not old.active then
    if not exists (
      select 1 from jsonb_each(new.working_hours) day
      where jsonb_typeof(day.value) = 'array' and jsonb_array_length(day.value) > 0
    ) then missing := array_append(missing, 'working_hours'); end if;
    if not exists (select 1 from public.services s where s.shop_id = new.id and s.active) then
      missing := array_append(missing, 'services');
    end if;
    if not exists (select 1 from public.shop_memberships m where m.shop_id = new.id
      and m.user_id = new.owner_user_id and m.role = 'OWNER' and m.active) then
      missing := array_append(missing, 'owner');
    end if;
    if not exists (select 1 from public.shop_memberships m where m.shop_id = new.id and m.role = 'SA' and m.active) then
      missing := array_append(missing, 'service_advisor');
    end if;
    if not exists (select 1 from public.shop_memberships m where m.shop_id = new.id and m.role = 'TECHNICIAN' and m.active) then
      missing := array_append(missing, 'technician');
    end if;
    if not exists (select 1 from public.shop_memberships m where m.shop_id = new.id and m.role = 'PARTS' and m.active) then
      missing := array_append(missing, 'parts');
    end if;
    if not exists (select 1 from public.shop_memberships m where m.shop_id = new.id and m.role = 'QC' and m.active) then
      missing := array_append(missing, 'quality_control');
    end if;
    if cardinality(missing) > 0 then
      raise exception 'Shop is not ready for publication: %', array_to_string(missing, ',') using errcode = 'BF001';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_shop_publication_readiness
before update of active on public.shops
for each row execute function private.enforce_shop_publication_readiness();

revoke all on function private.enforce_shop_publication_readiness() from public, anon, authenticated;

commit;
