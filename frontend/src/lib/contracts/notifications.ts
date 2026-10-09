import { z } from 'zod';
import { uuid } from './auth';

export const notificationOutput = z.object({
  id: uuid,
  userId: uuid,
  shopId: uuid.nullable(),
  bookingId: uuid.nullable(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListQuery = z.object({
  unread: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const notificationListOutput = z.object({
  items: z.array(notificationOutput),
  limit: z.number().int().min(1).max(50),
  unreadCount: z.number().int().nonnegative(),
});

export const markNotificationReadInput = z.object({
  notificationId: uuid.transform(value => value.toLowerCase()),
}).strict();

export type NotificationListQuery = z.infer<typeof notificationListQuery>;