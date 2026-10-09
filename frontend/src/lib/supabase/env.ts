import { z } from 'zod';

function isPublicKey(key: string) {
  if (key.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(atob(key.split('.')[1])).role === 'anon'; } catch { return false; }
}
export function publicEnvironment() {
  return z.object({ url: z.url(), key: z.string().refine(isPublicKey, 'Expected a publishable or legacy anon key.'), siteUrl: z.url() }).parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
