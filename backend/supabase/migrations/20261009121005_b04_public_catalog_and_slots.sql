begin;

-- B04 uses the established mon..sun -> [[HH:MM,HH:MM], ...] seed format.
-- Missing days and [] are closed. Intervals must be ordered and non-overlapping.
create function private.validate_working_hours(hours jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare day record; opening_window jsonb; last_end text; opening text; closing text;
begin
  if hours is null or jsonb_typeof(hours) <> 'object' then return false; end if;
  for day in select * from jsonb_each(hours) loop
    if day.key <> all(array['mon','tue','wed','thu','fri','sat','sun'])
      or jsonb_typeof(day.value) <> 'array' then return false; end if;
    if jsonb_array_length(day.value) > 4 then return false; end if;
    last_end := '00:00';
    for opening_window in select value from jsonb_array_elements(day.value) loop
      if jsonb_typeof(opening_window) <> 'array' then return false; end if;
      if jsonb_array_length(opening_window) <> 2 or jsonb_typeof(opening_window->0) <> 'string'
        or jsonb_typeof(opening_window->1) <> 'string' then return false; end if;
      opening := opening_window->>0; closing := opening_window->>1;
      if opening !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or closing !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or opening >= closing or opening < last_end then return false; end if;
      last_end := closing;
    end loop;
  end loop;
  return true;
end;
$$;

create function private.shop_slot_grid(hours jsonb, zone text, duration integer, first_day date)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = '' as $$
  select local_start at time zone zone, (local_start + make_interval(mins => duration)) at time zone zone
  from generate_series(0,13) as days(offset_day)
  cross join lateral (select first_day + offset_day as day) as calendar
  cross join lateral jsonb_array_elements(coalesce(hours -> (array['mon','tue','wed','thu','fri','sat','sun'])
    [extract(isodow from calendar.day)::integer], '[]'::jsonb)) as windows(value)
  cross join lateral generate_series(calendar.day + (windows.value->>0)::time,
    calendar.day + (windows.value->>1)::time - make_interval(mins => duration),
    make_interval(mins => duration)) as times(local_start)
  -- Omit nonexistent/ambiguous-length DST windows; never shift an opening silently.
  where ((local_start at time zone zone) at time zone zone) = local_start
    and (((local_start + make_interval(mins => duration)) at time zone zone) at time zone zone)
      = local_start + make_interval(mins => duration)
    and ((local_start + make_interval(mins => duration)) at time zone zone)
      - (local_start at time zone zone) = make_interval(mins => duration);
$$;

create function private.shop_dto(s public.shops)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'city',s.city,
    'address',s.address,'phone',s.phone,'workingHours',s.working_hours,'timezone',s.timezone,
    'slotDurationMinutes',s.slot_duration_minutes,'slotCapacity',s.slot_capacity,
    'logoUrl',s.logo_url,'active',s.active);
$$;

create function private.save_shop_impl(target_shop_id uuid, settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shops; actor uuid := auth.uid(); creating boolean := target_shop_id is null;
  key text; account auth.users; today date; previous public.shops;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if creating then
    select * into account from auth.users where id=actor for update;
    if not found then raise exception 'Sign in required' using errcode='42501'; end if;
    -- A new public identity may become an owner. Provisioned employees cannot
    -- promote themselves; an already-authoritative owner may own more shops.
    if not exists (select 1 from public.shops sh join public.shop_memberships m
      on m.shop_id=sh.id and m.user_id=actor and m.role='OWNER' and m.active where sh.owner_user_id=actor)
      and (account.raw_app_meta_data ? 'bayflow_provisioned_by'
        or exists(select 1 from public.shop_memberships m where m.user_id=actor and m.role<>'OWNER')) then
      raise exception 'Staff cannot create shops' using errcode='42501';
    end if;
    s.id := gen_random_uuid(); s.owner_user_id := actor; s.timezone := 'Asia/Karachi';
    s.slot_duration_minutes := 60; s.slot_capacity := 1; s.active := true;
    s.working_hours := '{}'::jsonb;
  else
    perform private.require_team_owner(target_shop_id);
    select * into s from public.shops where id=target_shop_id;
    previous := s;
  end if;
  if settings is null or jsonb_typeof(settings)<>'object' or settings='{}'::jsonb then
    raise exception 'Settings required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(settings) loop
    if key <> all(array['name','city','address','phone','workingHours','timezone','slotDurationMinutes','slotCapacity','active']) then
      raise exception 'Unsupported settings' using errcode='22023'; end if;
    if key in ('name','city','address','phone','timezone') and jsonb_typeof(settings->key)<>'string' then
      raise exception 'Text required' using errcode='22023'; end if;
    if key in ('slotDurationMinutes','slotCapacity') and
      (jsonb_typeof(settings->key)<>'number' or (settings->>key) !~ '^[0-9]{1,4}$') then
      raise exception 'Integer required' using errcode='22023'; end if;
    if key='active' and jsonb_typeof(settings->key)<>'boolean' then
      raise exception 'Boolean required' using errcode='22023'; end if;
  end loop;
  s.name := coalesce(btrim(settings->>'name'),s.name);
  s.city := coalesce(btrim(settings->>'city'),s.city);
  s.address := coalesce(btrim(settings->>'address'),s.address);
  s.phone := coalesce(btrim(settings->>'phone'),s.phone);
  s.timezone := coalesce(settings->>'timezone',s.timezone);
  s.working_hours := coalesce(settings->'workingHours',s.working_hours);
  s.slot_duration_minutes := coalesce((settings->>'slotDurationMinutes')::integer,s.slot_duration_minutes);
  s.slot_capacity := coalesce((settings->>'slotCapacity')::integer,s.slot_capacity);
  s.active := coalesce((settings->>'active')::boolean,s.active);
  if s.name is null or length(s.name) not between 1 and 120
    or s.city is null or length(s.city) not between 1 and 80
    or s.address is null or length(s.address) not between 1 and 500
    or s.phone is null or s.phone !~ '^[+0-9][0-9 ()-]{6,29}$'
    or s.slot_duration_minutes not between 15 and 240 or s.slot_capacity not between 1 and 100
    or not private.validate_working_hours(s.working_hours)
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=s.timezone) then
    raise exception 'Invalid shop settings' using errcode='22023';
  end if;
  today := (now() at time zone s.timezone)::date;
  if creating then
    perform private.sync_profile_impl();
    s.slug := coalesce(nullif(btrim(regexp_replace(lower(s.name),'[^a-z0-9]+','-','g'),'-'),''),'shop')
      || '-' || replace(s.id::text,'-','');
    insert into public.shops(id,owner_user_id,slug,name,city,address,phone,working_hours,timezone,
      slot_duration_minutes,slot_capacity,active) values (s.id,actor,s.slug,s.name,s.city,s.address,s.phone,
      s.working_hours,s.timezone,s.slot_duration_minutes,s.slot_capacity,s.active) returning * into s;
    insert into public.shop_memberships(shop_id,user_id,role) values(s.id,actor,'OWNER');
  else
    -- Serialize with the B05 slot lock before checking referenced appointments.
    perform 1 from public.appointment_slots a where a.shop_id=s.id and a.starts_at>now()
      order by a.starts_at for update;
    if (s.working_hours is distinct from previous.working_hours or s.timezone is distinct from previous.timezone
      or s.slot_duration_minutes is distinct from previous.slot_duration_minutes
      or s.slot_capacity is distinct from previous.slot_capacity) and exists(select 1 from public.appointment_slots a where a.shop_id=s.id and a.starts_at>now()
      and exists(select 1 from public.bookings b where b.slot_id=a.id and b.shop_id=s.id and b.status<>'CANCELLED')
      and (not exists(select 1 from private.shop_slot_grid(s.working_hours,s.timezone,s.slot_duration_minutes,
        (a.starts_at at time zone s.timezone)::date) g
        where g.starts_at=a.starts_at and g.ends_at=a.ends_at)
        or s.slot_capacity < (select count(*) from public.bookings b where b.slot_id=a.id and b.status<>'CANCELLED'))) then
      raise exception 'Settings conflict with booked appointments' using errcode='23514';
    end if;
    update public.shops set name=s.name,city=s.city,address=s.address,phone=s.phone,working_hours=s.working_hours,
      timezone=s.timezone,slot_duration_minutes=s.slot_duration_minutes,slot_capacity=s.slot_capacity,active=s.active
      where id=s.id returning * into s;
  end if;
  -- Remove only unreferenced future slots that no longer match the configuration.
  -- Cancelled bookings still retain their FK/audit records; projection hides stale slots.
  delete from public.appointment_slots a where a.shop_id=s.id and a.starts_at>now()
    and not exists(select 1 from public.bookings b where b.slot_id=a.id)
    and not exists(select 1 from private.shop_slot_grid(s.working_hours,s.timezone,s.slot_duration_minutes,today) g
      where g.starts_at=a.starts_at and g.ends_at=a.ends_at);
  insert into public.appointment_slots as a(shop_id,starts_at,ends_at,capacity)
    select s.id,g.starts_at,g.ends_at,s.slot_capacity
    from private.shop_slot_grid(s.working_hours,s.timezone,s.slot_duration_minutes,today) g where g.starts_at>now()
    on conflict(shop_id,starts_at) do update set capacity=excluded.capacity,ends_at=excluded.ends_at
      -- Preserve even cancelled appointments' recorded time window.
      where a.ends_at=excluded.ends_at or not exists(select 1 from public.bookings b where b.slot_id=a.id);
  return private.shop_dto(s);
end;
$$;

create function private.save_service_impl(target_shop_id uuid, target_service_id uuid, settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.services; key text;
begin
  perform private.require_team_owner(target_shop_id);
  if target_service_id is not null then
    select * into s from public.services where id=target_service_id and shop_id=target_shop_id for update;
    if not found then raise exception 'Service not found' using errcode='P0002'; end if;
  else
    s.id := gen_random_uuid(); s.shop_id := target_shop_id; s.description := ''; s.active := true;
  end if;
  if settings is null or jsonb_typeof(settings)<>'object' or settings='{}'::jsonb then
    raise exception 'Settings required' using errcode='22023'; end if;
  for key in select jsonb_object_keys(settings) loop
    if key <> all(array['name','description','durationMinutes','basePricePkr','active']) then
      raise exception 'Unsupported service settings' using errcode='22023'; end if;
    if key in ('name','description') and jsonb_typeof(settings->key)<>'string' then
      raise exception 'Text required' using errcode='22023'; end if;
    if (key='durationMinutes' or (key='basePricePkr' and settings->key<>'null'::jsonb))
      and (jsonb_typeof(settings->key)<>'number' or (settings->>key) !~ '^[0-9]{1,9}$') then
      raise exception 'Integer required' using errcode='22023'; end if;
    if key='active' and jsonb_typeof(settings->key)<>'boolean' then
      raise exception 'Boolean required' using errcode='22023'; end if;
  end loop;
  s.name := coalesce(btrim(settings->>'name'),s.name);
  s.description := coalesce(settings->>'description',s.description);
  s.duration_minutes := coalesce((settings->>'durationMinutes')::integer,s.duration_minutes);
  if settings ? 'basePricePkr' then s.base_price_pkr := (settings->>'basePricePkr')::integer; end if;
  s.active := coalesce((settings->>'active')::boolean,s.active);
  if s.name is null or length(s.name) not between 1 and 120 or length(s.description)>2000
    or s.duration_minutes is null or s.duration_minutes not between 1 and 1440
    or s.base_price_pkr<0 then raise exception 'Invalid service settings' using errcode='22023'; end if;
  if target_service_id is null then
    insert into public.services(id,shop_id,name,description,duration_minutes,base_price_pkr,active)
      values(s.id,s.shop_id,s.name,s.description,s.duration_minutes,s.base_price_pkr,s.active) returning * into s;
  else
    update public.services set name=s.name,description=s.description,duration_minutes=s.duration_minutes,
      base_price_pkr=s.base_price_pkr,active=s.active where id=s.id returning * into s;
  end if;
  return jsonb_build_object('id',s.id,'shopId',s.shop_id,'name',s.name,'description',s.description,
    'durationMinutes',s.duration_minutes,'basePricePkr',s.base_price_pkr,'active',s.active);
end;
$$;

create function public.save_shop(target_shop_id uuid, settings jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_shop_impl(target_shop_id,settings);
$$;
create function public.save_service(target_shop_id uuid, target_service_id uuid, settings jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_service_impl(target_shop_id,target_service_id,settings);
$$;

-- Audited public projection: only aggregate capacity is exposed, never booking IDs.
-- B05 must recheck configuration/capacity under the same slot lock at booking time.
create or replace view public.public_appointment_slots with (security_barrier=true) as
  select a.id,a.shop_id,a.starts_at,a.ends_at,a.capacity,
    greatest(0,a.capacity - (select count(*)::integer from public.bookings b
      where b.shop_id=a.shop_id and b.slot_id=a.id and b.status<>'CANCELLED')) as capacity_remaining,
    (a.starts_at at time zone s.timezone)::date as local_date
  from public.appointment_slots a join public.shops s on s.id=a.shop_id
  where s.active and a.starts_at>now()
    and (a.starts_at at time zone s.timezone)::date between (now() at time zone s.timezone)::date
      and (now() at time zone s.timezone)::date+13
    and a.ends_at-a.starts_at=make_interval(mins=>s.slot_duration_minutes)
    and (a.ends_at at time zone s.timezone) - (a.starts_at at time zone s.timezone)
      =make_interval(mins=>s.slot_duration_minutes)
    and exists(select 1 from jsonb_array_elements(coalesce(s.working_hours ->
      (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from a.starts_at at time zone s.timezone)::integer],
      '[]'::jsonb)) w(value)
      where (a.starts_at at time zone s.timezone)::time >= (w.value->>0)::time
        and (a.ends_at at time zone s.timezone) <= (a.starts_at at time zone s.timezone)::date + (w.value->>1)::time
        and mod(extract(epoch from ((a.starts_at at time zone s.timezone)
          - ((a.starts_at at time zone s.timezone)::date + (w.value->>0)::time)))::numeric,
          s.slot_duration_minutes*60)=0);

-- No new table grants, write policies, tables or status values.
revoke all on function private.validate_working_hours(jsonb), private.shop_slot_grid(jsonb,text,integer,date),
  private.shop_dto(public.shops),private.save_shop_impl(uuid,jsonb),private.save_service_impl(uuid,uuid,jsonb),
  public.save_shop(uuid,jsonb),public.save_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.save_shop_impl(uuid,jsonb),private.save_service_impl(uuid,uuid,jsonb),
  public.save_shop(uuid,jsonb),public.save_service(uuid,uuid,jsonb) to authenticated;

commit;
