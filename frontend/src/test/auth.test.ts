import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';

const mocks = vi.hoisted(() => ({ client: vi.fn(), headers: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
import { requireIdentity, syncProfile } from '@/lib/auth/session';
import { signup, login, logout } from '@/lib/auth/actions';

const password = 'Test-Password-123!';
const authUser = { id: 'b0300000-0000-4000-8000-000000000001', email: 'user@example.test' };
function setup() {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({ data: { id: authUser.id, fullName: 'Name', phone: null }, error: null });
  const client = { auth, rpc };
  mocks.client.mockResolvedValue(client);
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  mocks.headers.mockResolvedValue(new Headers({ Origin: 'http://localhost:3000' }));
});
it('verifies the identity with Auth rather than trusting cookie session data', async () => {
  const client = setup();
  expect((await requireIdentity()).user.id).toBe(authUser.id);
  expect(client.auth.getUser).toHaveBeenCalledOnce();
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } } as never);
  await expect(requireIdentity()).rejects.toMatchObject({ status: 401 });
});
it('profile sync cannot accept a forged actor identity', async () => {
  const client = setup();
  expect((await syncProfile(client as never)).id).toBe(authUser.id);
  expect(client.rpc).toHaveBeenCalledWith('sync_profile', {});
});
it('signup sends only display metadata and handles pending email confirmation', async () => {
  const client = setup();
  const result = await signup({ fullName: 'Name', email: authUser.email, password });
  expect(result).toEqual({ data: { requiresEmailConfirmation: true }, error: null });
  expect(client.auth.signUp).toHaveBeenCalledWith({ email: authUser.email, password, options: {
    data: { full_name: 'Name' }, emailRedirectTo: 'http://localhost:3000/auth/callback',
  } });
  expect(client.rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain(password);
});
it('signup refuses role metadata and duplicate-email obfuscated identities', async () => {
  const client = setup();
  expect((await signup({ fullName: 'Name', email: authUser.email, password, role: 'OWNER' })).error).toBeTruthy();
  expect(client.auth.signUp).not.toHaveBeenCalled();
  client.auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
  expect((await signup({ fullName: 'Name', email: authUser.email, password })).error).toContain('sign in');
});
it('login sets the Supabase cookie session, syncs profile, and returns no token/password', async () => {
  const client = setup();
  const result = await login({ email: authUser.email, password });
  expect(result).toEqual({ data: { signedIn: true }, error: null });
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: authUser.email, password });
  expect(client.rpc).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain(password);
});
it('failed login does not sync profiles and hides provider errors', async () => {
  const client = setup(); client.auth.signInWithPassword.mockResolvedValue({ error: { message: 'sensitive provider error' } } as never);
  const result = await login({ email: authUser.email, password });
  expect(result.error).not.toContain('sensitive'); expect(client.rpc).not.toHaveBeenCalled();
});
it('logout revokes the current session through Supabase', async () => {
  const client = setup();
  expect((await logout()).data).toEqual({ signedOut: true });
  expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('cross-origin auth actions are rejected before using credentials', async () => {
  setup(); mocks.headers.mockResolvedValue(new Headers({ Origin: 'https://attacker.test' }));
  await expect(login({ email: authUser.email, password })).rejects.toBeInstanceOf(ApiError);
  expect(mocks.client).not.toHaveBeenCalled();
});
