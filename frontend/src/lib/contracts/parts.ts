import { z } from 'zod';
import { uuid } from './auth';

const identifier = uuid.transform(value => value.toLowerCase());
const nonnegative = z.number().int().nonnegative().max(999_999_999);
const partsItems = z.array(z.object({ partId: identifier, quantity: z.number().int().min(1).max(999_999_999) }).strict())
  .min(1).max(100).refine(items => new Set(items.map(item => item.partId)).size === items.length, 'Parts must be distinct.')
  .transform(items => items.sort((a, b) => a.partId.localeCompare(b.partId)));
export const orderPartsPayload = z.object({
  items: partsItems,
  supplierName: z.string().trim().max(200).nullable().optional(),
}).strict();
export const receivePartsPayload = z.object({ purchaseOrderId: identifier, items: partsItems }).strict();
const mutation = z.object({ expectedVersion: z.number().int().nonnegative().max(2_147_483_647), idempotencyKey: identifier });
export const orderPartsInput = mutation.extend(orderPartsPayload.shape).strict();
export const receivePartsInput = mutation.extend({ items: partsItems }).strict();
export const allocatePartsInput = mutation.strict();
export const inventoryInput = z.object({
  id: identifier.optional(),
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  quantityOnHand: nonnegative.optional(),
  reorderLevel: nonnegative.default(0),
  unitCostPkr: nonnegative,
  active: z.boolean().optional(),
}).strict().refine(input => !input.id || input.quantityOnHand === undefined, 'Stock cannot be overwritten.');
export const inventoryQuery = z.object({ page: z.string().regex(/^[1-9][0-9]{0,4}$/).transform(Number).default(1) }).strict();
export const inventoryPartOutput = z.object({
  id: uuid, shopId: uuid, sku: z.string(), name: z.string(), quantityOnHand: z.number().int().nonnegative(),
  reorderLevel: z.number().int().nonnegative(), unitCostPkr: z.number().int().nonnegative(), active: z.boolean(),
});
export const inventoryListOutput = z.object({ items: z.array(inventoryPartOutput), page: z.number().int().positive(), pageSize: z.literal(50), total: z.number().int().nonnegative() });
export const requiredPartOutput = z.object({
  partId: uuid, quantityRequired: z.number().int().positive(), quantityOnHand: z.number().int().nonnegative(),
  quantityAllocated: z.number().int().nonnegative(), shortageQuantity: z.number().int().nonnegative(),
});
export const purchaseOrderOutput = z.object({
  id: uuid, shopId: uuid, bookingId: uuid, createdBy: uuid,
  status: z.enum(['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED']), supplierName: z.string().nullable(),
  orderedAt: z.string(), receivedAt: z.string().nullable(),
  items: z.array(z.object({ id: uuid, partId: uuid, quantityOrdered: z.number().int().positive(), quantityReceived: z.number().int().nonnegative() })),
});
export const partAllocationOutput = z.object({
  id: uuid, partId: uuid, quantity: z.number().int().positive(), allocatedBy: uuid,
  allocatedAt: z.string(), releasedAt: z.string().nullable(),
});
export type InventoryInput = z.infer<typeof inventoryInput>;
