import 'server-only';
import { ApiError } from '@/lib/api/response';
import { notificationListOutput, notificationOutput, type NotificationListQuery } from '@/lib/contracts/notifications';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

function notificationError(error: { code?: string }): never {
  if (error.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'Notification access is not permitted.');
  if (error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Notification was not found.');
  if (error.code === '22023') throw new ApiError(400, 'INVALID_INPUT', 'Check the notification request.');
  throw new ApiError(500, 'DATABASE_ERROR', 'Notifications could not be loaded.');
}

export async function listNotifications(client: Client, query: NotificationListQuery) {
  const result = await client.rpc('list_notifications', { input: query });
  if (result.error) notificationError(result.error);
  return notificationListOutput.parse(result.data);
}

export async function markNotificationRead(client: Client, notificationId: string) {
  const result = await client.rpc('mark_notification_read', { input: { notificationId } });
  if (result.error) notificationError(result.error);
  return notificationOutput.parse(result.data);
}