import { z } from 'zod';
import { getBookingIdentity, BookingReadError } from './booking';
import { workspaceRead } from './workspace';
import { notificationListOutput, notificationOutput } from '@/lib/contracts/notifications';
import type { Membership } from '@/lib/contracts/auth';

export async function loadNotificationFeed(expectedUserId: string | undefined, unread: boolean, signal: AbortSignal) {
  const identity = await getBookingIdentity(signal);
  if (!identity) throw new BookingReadError(401, 'UNAUTHENTICATED');
  if (expectedUserId && identity.user.id !== expectedUserId) throw new BookingReadError(403, 'ACCOUNT_CHANGED');
  const feed = await workspaceRead(`/api/v1/notifications?unread=${unread}&limit=20`, notificationListOutput, signal);
  if (feed.items.some(item => item.userId !== identity.user.id)) throw new BookingReadError(403, 'ACCOUNT_CHANGED');
  return { ...feed, userId: identity.user.id, memberships: identity.memberships };
}
export type NotificationFeed = Awaited<ReturnType<typeof loadNotificationFeed>>;
export async function markRead(id: string, userId: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/v1/notifications/${z.uuid().parse(id)}/read`, { method: 'POST',
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new BookingReadError(response.status, 'MARK_READ_FAILED');
    const notification = z.object({ data: notificationOutput, error: z.null() }).parse(await response.json()).data;
    if (notification.id !== id || notification.userId !== userId || !notification.readAt) throw new Error('Unexpected read-marker response.');
    return notification;
  } finally { clearTimeout(timer); }
}
export function notificationDestination(notification: z.infer<typeof notificationOutput>, memberships: Membership[]) {
  if (!notification.bookingId) return null;
  const member = memberships.find(item => item.active && item.userId === notification.userId && item.shopId === notification.shopId);
  return member ? `/shops/${member.shopId}/bookings/${notification.bookingId}` : `/customer/bookings/${notification.bookingId}`;
}
