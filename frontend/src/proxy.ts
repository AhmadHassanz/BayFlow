import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) { return updateSession(request); }
export const config = { matcher: ['/api/v1/:path*', '/auth/:path*', '/login', '/signup', '/customer/:path*', '/book/:path*', '/owner/:path*', '/shops/:path*'] };
