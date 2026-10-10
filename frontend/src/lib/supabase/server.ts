import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { AppDatabase } from './database.f08';
import { publicEnvironment } from './env';

export async function createClient() {
  const store = await cookies();
  const env = publicEnvironment();
  return createServerClient<AppDatabase>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
