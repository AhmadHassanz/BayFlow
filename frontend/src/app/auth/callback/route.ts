import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicEnvironment } from '@/lib/supabase/env';
import { safeNext } from '@/lib/auth/redirect';
import { syncProfile } from '@/lib/auth/session';
import { ApiError, failure } from '@/lib/api/response';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) throw new ApiError(400, 'AUTH_CALLBACK_FAILED', 'This sign-in link is invalid or expired.');
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new ApiError(400, 'AUTH_CALLBACK_FAILED', 'This sign-in link is invalid or expired.');
    await syncProfile(client);
    const response = NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), publicEnvironment().siteUrl));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) { return failure(error); }
}
