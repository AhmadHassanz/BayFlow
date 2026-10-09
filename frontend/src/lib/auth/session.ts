import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { ApiError, databaseError } from '@/lib/api/response';
import { profileOutput } from '@/lib/contracts/auth';

export async function requireIdentity() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return { client, user: data.user };
}
export async function syncProfile(client: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await client.rpc('sync_profile', {});
  if (error) databaseError(error);
  return profileOutput.parse(data);
}
