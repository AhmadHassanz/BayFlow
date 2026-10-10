import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicEnvironment } from '@/lib/supabase/env';
import { safeNext } from '@/lib/auth/redirect';
import { syncProfile } from '@/lib/auth/session';
import { failure } from '@/lib/api/response';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  try {
    const code = url.searchParams.get('code');
    if (!code) {
      const recovery = new URL('/login', publicEnvironment().siteUrl);
      recovery.searchParams.set('next', next);
      recovery.searchParams.set('confirmation', 'expired');
      return NextResponse.redirect(recovery);
    }
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      const recovery = new URL('/login', publicEnvironment().siteUrl);
      recovery.searchParams.set('next', next);
      recovery.searchParams.set('confirmation', 'expired');
      return NextResponse.redirect(recovery);
    }
    await syncProfile(client);
    const response = NextResponse.redirect(new URL(next, publicEnvironment().siteUrl));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) { return failure(error); }
}
