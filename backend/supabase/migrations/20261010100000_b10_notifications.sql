create function private.notification_dto(n public.notifications)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id,
    'userId', n.user_id,
    'shopId', n.shop_id,
    'bookingId', n.booking_id,
    'type', n.type,
    'title', n.title,
    'message', n.message,
    'readAt', n.read_at,
    'createdAt', n.created_at
  )
$$;

create function public.list_notifications(input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  only_unread boolean := coalesce((input->>'unread')::boolean, false);
  requested_limit integer := coalesce((input->>'limit')::integer, 20);
  bounded_limit integer;
begin
  if actor is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if input is null or jsonb_typeof(input) <> 'object' then
    raise invalid_parameter_value using message = 'Invalid notification query';
  end if;
  if (select count(*) from jsonb_object_keys(input) as k(key) where key not in ('unread','limit')) > 0 then
    raise invalid_parameter_value using message = 'Invalid notification query';
  end if;
  if requested_limit < 1 or requested_limit > 50 then
    raise invalid_parameter_value using message = 'Invalid notification limit';
  end if;
  bounded_limit := requested_limit;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'userId', n.user_id,
        'shopId', n.shop_id,
        'bookingId', n.booking_id,
        'type', n.type,
        'title', n.title,
        'message', n.message,
        'readAt', n.read_at,
        'createdAt', n.created_at
      ) order by n.created_at desc, n.id desc)
      from (
        select *
        from public.notifications n
        where n.user_id = actor
          and (not only_unread or n.read_at is null)
        order by n.created_at desc, n.id desc
        limit bounded_limit
      ) n
    ), '[]'::jsonb),
    'limit', bounded_limit,
    'unreadCount', (
      select count(*)::integer
      from public.notifications n
      where n.user_id = actor and n.read_at is null
    )
  );
end;
$$;

create function private.mark_notification_read_impl(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_id uuid;
  notice public.notifications%rowtype;
begin
  if actor is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if input is null or jsonb_typeof(input) <> 'object' then
    raise invalid_parameter_value using message = 'Invalid notification payload';
  end if;
  if (select count(*) from jsonb_object_keys(input) as k(key) where key <> 'notificationId') > 0 then
    raise invalid_parameter_value using message = 'Invalid notification payload';
  end if;
  target_id := (input->>'notificationId')::uuid;

  select * into notice
  from public.notifications n
  where n.id = target_id
    and n.user_id = actor
    and private.can_read_notification(n.shop_id, n.booking_id)
  for update;

  if not found then
    raise no_data_found using message = 'Notification not found';
  end if;

  if notice.read_at is null then
    update public.notifications n
    set read_at = transaction_timestamp()
    where n.id = target_id
    returning * into notice;
  end if;

  return private.notification_dto(notice);
end;
$$;

create function public.mark_notification_read(input jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.mark_notification_read_impl(input)
$$;

revoke all on function private.notification_dto(public.notifications) from public;
revoke all on function private.mark_notification_read_impl(jsonb) from public;
revoke all on function public.list_notifications(jsonb) from public;
revoke all on function public.mark_notification_read(jsonb) from public;
grant execute on function public.list_notifications(jsonb) to authenticated;
grant execute on function public.mark_notification_read(jsonb) to authenticated;
grant execute on function private.mark_notification_read_impl(jsonb) to authenticated;