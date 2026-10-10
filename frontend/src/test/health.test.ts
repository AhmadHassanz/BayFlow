import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ publicClient: vi.fn() }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: mocks.publicClient }));
import { GET } from '@/app/api/v1/health/route';

beforeEach(() => vi.resetAllMocks());

it('reports a safe healthy envelope only after the public database responds', async () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const select = vi.fn().mockReturnValue({ limit });
  mocks.publicClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { status: 'ok' }, error: null });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(select).toHaveBeenCalledWith('id');
  expect(limit).toHaveBeenCalledWith(1);
});

it('returns a correlated safe 503 without exposing database details', async () => {
  const limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'private database host' } });
  mocks.publicClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ limit }) }) });
  const response = await GET();
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body).toMatchObject({ data: null, error: {
    code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.',
  } });
  expect(response.headers.get('x-request-id')).toBe(body.error.details.requestId);
  expect(JSON.stringify(body)).not.toContain('private database host');
});
