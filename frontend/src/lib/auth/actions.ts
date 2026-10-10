'use server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { publicEnvironment } from '@/lib/supabase/env';
import { loginInput, signupInput } from '@/lib/contracts/auth';
import { syncProfile, requireIdentity } from './session';
import { ApiError } from '@/lib/api/response';
import { safeNext } from './redirect';
import { z } from 'zod';

async function sameOrigin() {
  if ((await headers()).get('origin') !== new URL(publicEnvironment().siteUrl).origin)
    throw new ApiError(403, 'FORBIDDEN', 'A same-origin request is required.');
}
// Server Actions are the auth transport; no additional /api/v1 auth URLs.
// These return only safe state, never a session, Auth user object or password.
export async function signup(input: unknown, next?: string) {
  await sameOrigin();
  const value = signupInput.safeParse(input);
  if (!value.success) return { error: 'Check your name, email and password.' };
  const client = await createClient();
  const callback = new URL('/auth/callback', publicEnvironment().siteUrl);
  if (next) callback.searchParams.set('next', safeNext(next));
  const { data, error } = await client.auth.signUp({ email: value.data.email, password: value.data.password,
    options: { data: { full_name: value.data.fullName }, emailRedirectTo: callback.toString() } });
  if (error || (data.user?.identities && data.user.identities.length === 0))
    return { error: 'Unable to create an account. If this email is registered, sign in.' };
  if (data.session) await syncProfile(client);
  return { data: { requiresEmailConfirmation: !data.session }, error: null };
}
export async function login(input: unknown) {
  await sameOrigin();
  const value = loginInput.safeParse(input);
  if (!value.success) return { error: 'Enter a valid email and password.' };
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword(value.data);
  if (error) return { error: 'Unable to sign in. Check your credentials and email confirmation.' };
  await syncProfile(client);
  return { data: { signedIn: true }, error: null };
}
export async function resendConfirmation(input: unknown, next?: string) {
  await sameOrigin();
  const parsed = z.object({ email: z.email().max(254) }).safeParse(input);
  if (!parsed.success) return { error: 'Enter the email address used for this account.' };
  const callback = new URL('/auth/callback', publicEnvironment().siteUrl);
  if (next) callback.searchParams.set('next', safeNext(next));
  const client = await createClient();
  await client.auth.resend({ type: 'signup', email: parsed.data.email, options: { emailRedirectTo: callback.toString() } });
  return { data: { requested: true }, error: null };
}
export async function logout() {
  await sameOrigin();
  const { client } = await requireIdentity();
  const { error } = await client.auth.signOut({ scope: 'local' });
  return error ? { error: 'Unable to sign out. Try again.' } : { data: { signedOut: true }, error: null };
}
