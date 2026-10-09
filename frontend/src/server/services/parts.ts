import 'server-only';
import { ApiError } from '@/lib/api/response';
import { inventoryListOutput, inventoryPartOutput, type InventoryInput } from '@/lib/contracts/parts';
import type { createClient } from '@/lib/supabase/server';
import { bookingActionError } from './booking-actions';

type Client = Awaited<ReturnType<typeof createClient>>;
export async function listInventory(client: Client, shopId: string, page: number) {
  const result = await client.rpc('list_inventory', { input: { shopId, page } });
  if (result.error) bookingActionError(result.error);
  return inventoryListOutput.parse(result.data);
}
export async function saveInventoryPart(client: Client, shopId: string, input: InventoryInput) {
  const result = await client.rpc('save_inventory_part', { input: { shopId, ...input } });
  if (result.error?.code === '23505') throw new ApiError(409, 'SKU_EXISTS', 'This shop already has that SKU.');
  if (result.error) bookingActionError(result.error);
  return inventoryPartOutput.parse(result.data);
}
export async function purchaseOrderBooking(client: Client, purchaseOrderId: string) {
  const result = await client.from('purchase_orders').select('booking_id').eq('id', purchaseOrderId).maybeSingle();
  if (result.error) bookingActionError(result.error);
  if (!result.data?.booking_id) throw new ApiError(404, 'NOT_FOUND', 'Purchase order was not found.');
  return result.data.booking_id;
}
