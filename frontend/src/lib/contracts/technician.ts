import { z } from 'zod';
import { uuid } from './auth';
import { bookingVehicle } from './bookings';
import { ownerListQuery } from './owner';

export const customerContextOutput = z.object({ fullName: z.string(), phone: z.string().nullable() }).strict();
export const vehicleContextOutput = bookingVehicle;
export const estimateCatalogQuery = ownerListQuery;
export const estimateCatalogOutput = z.object({
  items: z.array(z.object({ id: uuid, sku: z.string(), name: z.string() }).strict()),
  page: z.number().int().positive(), pageSize: z.literal(50), total: z.number().int().nonnegative(),
}).strict();
export type CatalogPart = z.infer<typeof estimateCatalogOutput>['items'][number];
