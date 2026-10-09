import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { notificationListQuery } from '@/lib/contracts/notifications';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  list: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('@/server/services/notifications', () => ({
  listNotifications: mocks.list,
  markNotificationRead: mocks.markRead,
}));

import { GET } from '@/app/api/v1/notifications/route';
import { POST } from '@/app/api/v1/notifications/[id]/read/route';

const id = 'b1000000-0000-4000-8000-000000000001';
const notice = {
  id,
  userId: 'b1000000-0000-4000-8000-000000000002',
  shopId: 'b1000000-0000-4000-8000-000000000003',
  bookingId: 'b1000000-0000-4000-8000-000000000004',
  type: 'READY_FOR_PICKUP',
  title: 'Ready for pickup',
  message: 'Your vehicle is ready.',
  readAt: null,
  createdAt: '2026-10-10T10:00:00Z',
};
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue({ client: {}, user: { id: notice.userId } });
  mocks.list.mockResolvedValue({ items: [notice], limit: 20, unreadCount: 1 });
  mocks.markRead.mockResolvedValue({ ...notice, readAt: '2026-10-10T10:01:00Z' });
});

it('parses notification list query and rejects unknown keys', async () => {
  expect(notificationListQuery.parse({ unread: 'true', limit: '5' })).toEqual({ unread: true, limit: 5 });
  let response = await GET(new Request('http://localhost:3000/api/v1/notifications?unread=true&limit=5'));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({}, { unread: true, limit: 5 });
  response = await GET(new Request('http://localhost:3000/api/v1/notifications?shopId=bad'));
  expect(response.status).toBe(400);
  expect(() => notificationListQuery.parse({ limit: '51' })).toThrow();
});

it('marks a same-origin notification read through verified identity', async () => {
  const response = await POST(new Request(`http://localhost:3000/api/v1/notifications/${id}/read`, {
    method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{}',
  }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { ...notice, readAt: '2026-10-10T10:01:00Z' }, error: null });
  expect(mocks.markRead).toHaveBeenCalledWith({}, id);
});

it('requires same-origin and identity for read markers', async () => {
  let response = await POST(new Request(`http://localhost:3000/api/v1/notifications/${id}/read`, {
    method: 'POST', headers: { Origin: 'https://bad.test' }, body: '{}',
  }), context);
  expect(response.status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in.'));
  response = await POST(new Request(`http://localhost:3000/api/v1/notifications/${id}/read`, {
    method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{}',
  }), context);
  expect(response.status).toBe(401);
});