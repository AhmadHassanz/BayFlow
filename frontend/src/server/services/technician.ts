import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { estimateCatalogOutput } from '@/lib/contracts/technician';
import { bookingActionError } from './booking-actions';

export async function listEstimateCatalog(client: Awaited<ReturnType<typeof createClient>>, bookingId: string, page: number) {
  const result = await client.rpc('list_estimate_catalog', { input: { bookingId, page } });
  if (result.error) bookingActionError(result.error);
  return estimateCatalogOutput.parse(result.data);
}
