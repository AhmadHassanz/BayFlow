import { slugInput } from '@/lib/contracts/shops';
import { success, failure } from '@/lib/api/response';
import { shopDetail } from '@/server/services/shops';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try { return success(await shopDetail(slugInput.parse((await params).slug), true)); }
  catch (error) { return failure(error); }
}
