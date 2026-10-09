import 'server-only';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/response';
import { slugInput } from '@/lib/contracts/shops';
import { uuid } from '@/lib/contracts/auth';
import { shopDetailOutput } from '@/lib/api/shops';
import { shopDetail } from '@/server/services/shops';

// SSR uses the same session-free projection as GET /api/v1/shops, avoiding
// a server-to-itself HTTP dependency on the deployment origin.
export async function loadPublicShop(identifier: string, bySlug: boolean) {
  const parsed = (bySlug ? slugInput : uuid).safeParse(identifier);
  if (!parsed.success) notFound();
  try { return shopDetailOutput.parse(await shopDetail(parsed.data, bySlug)); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
