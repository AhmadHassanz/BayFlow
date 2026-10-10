import { success, failure, ApiError } from '@/lib/api/response';
import { createPublicClient } from '@/lib/supabase/public';

export async function GET() {
  try {
    const result = await createPublicClient().from('public_shops').select('id').limit(1);
    if (result.error) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.');
    return success({ status: 'ok' as const });
  } catch (error) { return failure(error); }
}
