'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { AppDatabase } from './database.b03';
import { publicEnvironment } from './env';

export function createClient() {
  const env = publicEnvironment();
  return createBrowserClient<AppDatabase>(env.url, env.key);
}
