import 'server-only';
import { ApiError } from '@/lib/api/response';

// Bounded, best-effort per-process protection; no distributed limit is claimed.
const attempts = new Map<string, { count: number; expires: number }>();
export function limitBookingCreation(actor: string, now = Date.now()) {
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const bucket = attempts.get(actor) ?? { count: 0, expires: now + 60000 };
  if (bucket.count >= 30 || (!attempts.has(actor) && attempts.size >= 10000))
    throw new ApiError(429, 'RATE_LIMITED', 'Too many booking requests. Try again shortly with the same request key.');
  bucket.count += 1;
  attempts.set(actor, bucket);
}
