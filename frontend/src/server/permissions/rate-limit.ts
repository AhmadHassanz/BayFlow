import 'server-only';
import { ApiError } from '@/lib/api/response';

// Best-effort per-process safeguard; Supabase Auth has separate upstream limits.
// A distributed limiter is deferred until deployment infrastructure is selected.
const attempts = new Map<string, { count: number; expires: number }>();
export function limitStaffCreation(actor: string, now = Date.now()) {
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const bucket = attempts.get(actor) ?? { count: 0, expires: now + 60000 };
  if (bucket.count >= 10 || (!attempts.has(actor) && attempts.size >= 10000))
    throw new ApiError(429, 'RATE_LIMITED', 'Too many staff creation requests. Try again shortly.');
  bucket.count += 1;
  attempts.set(actor, bucket);
}
