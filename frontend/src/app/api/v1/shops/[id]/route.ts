import { uuid } from '@/lib/contracts/auth';
import { success, failure } from '@/lib/api/response';
import { shopDetail } from '@/server/services/shops';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return success(await shopDetail(uuid.parse((await params).id))); }
  catch (error) { return failure(error); }
}
