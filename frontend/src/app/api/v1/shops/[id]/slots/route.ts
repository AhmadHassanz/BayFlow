import { uuid } from '@/lib/contracts/auth';
import { slotsQuery, queryObject } from '@/lib/contracts/shops';
import { success, failure } from '@/lib/api/response';
import { listSlots } from '@/server/services/shops';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid.parse((await params).id);
    const { date } = slotsQuery.parse(queryObject(request));
    return success(await listSlots(id, date));
  } catch (error) { return failure(error); }
}
