import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ ssr: vi.fn(), server: vi.fn(), sync: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.ssr }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.server }));
vi.mock('@/lib/auth/session', () => ({ syncProfile: mocks.sync }));
import { updateSession } from '@/lib/supabase/proxy';
import { GET } from '@/app/auth/callback/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
});
it('proxy verifies claims and forwards rotated cookies to both request and response', async () => {
  const claims = vi.fn();
  mocks.ssr.mockImplementation((_url, _key, options) => {
    claims.mockImplementation(async () => {
      options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'rotated', options: { path: '/', sameSite: 'lax' } }]);
      return { data: { claims: { sub: 'verified-user' } }, error: null };
    });
    return { auth: { getClaims: claims } };
  });
  const request = new NextRequest('http://localhost:3000/api/v1/me');
  const response = await updateSession(request);
  expect(claims).toHaveBeenCalledOnce();
  expect(request.cookies.get('sb-test-auth-token')?.value).toBe('rotated');
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('rotated');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('callback exchanges the PKCE code, syncs profile and redirects locally', async () => {
  const exchange = vi.fn().mockResolvedValue({ error: null });
  const client = { auth: { exchangeCodeForSession: exchange } };
  mocks.server.mockResolvedValue(client);
  const response = await GET(new Request('http://localhost:3000/auth/callback?code=one-time&next=%2Fbook%2Fshop%3Fstep%3D4'));
  expect(exchange).toHaveBeenCalledWith('one-time'); expect(mocks.sync).toHaveBeenCalledWith(client);
  expect(response.headers.get('location')).toBe('http://localhost:3000/book/shop?step=4');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('callback redirects missing/expired codes to recoverable confirmation without a raw provider exception', async () => {
  expect((await GET(new Request('http://localhost:3000/auth/callback?next=%2Fowner%2Fonboarding&error_code=otp_expired'))).headers.get('location')).toBe('http://localhost:3000/login?next=%2Fowner%2Fonboarding&confirmation=expired');
  mocks.server.mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: { message: 'secret' } }) } });
  const response = await GET(new Request('http://localhost:3000/auth/callback?code=expired'));
  expect(response.status).toBe(307); expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fapi%2Fv1%2Fme&confirmation=expired');
  expect(mocks.sync).not.toHaveBeenCalled();
});
