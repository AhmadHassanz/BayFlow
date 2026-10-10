import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, failure } from '@/lib/api/response';

describe('API failure hardening', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => log.mockClear());

  it('returns and logs an opaque correlation id without raw exception details', async () => {
    const response = failure(new Error('database password and stack must stay private'));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({ data: null, error: {
      code: 'INTERNAL_ERROR', message: 'The request could not be completed.',
      details: { requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    } });
    expect(response.headers.get('x-request-id')).toBe(body.error.details.requestId);
    expect(JSON.stringify(body)).not.toContain('database password');
    expect(log).toHaveBeenCalledWith('[bayflow-api]', {
      requestId: body.error.details.requestId, status: 500, code: 'INTERNAL_ERROR',
    });
  });

  it('preserves safe domain errors and adds the same correlation id', async () => {
    const response = failure(new ApiError(409, 'STATE_CONFLICT', 'Reload this booking.'));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: 'STATE_CONFLICT', message: 'Reload this booking.' });
    expect(response.headers.get('x-request-id')).toBe(body.error.details.requestId);
  });
});
