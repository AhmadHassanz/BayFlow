import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { AppDatabase } from './database.b04';
import { publicEnvironment } from './env';

export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if ((!secret && !legacy) || (secret && legacy)) throw new Error('Configure exactly one server-only Supabase admin key.');
  return createClient<AppDatabase>(publicEnvironment().url, (secret ?? legacy)!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
