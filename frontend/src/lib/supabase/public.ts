import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { AppDatabase } from './database.b04';
import { publicEnvironment } from './env';

// Catalog reads always use anon, irrespective of a visitor's session. No Admin key.
export function createPublicClient() {
  const env = publicEnvironment();
  return createClient<AppDatabase>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
