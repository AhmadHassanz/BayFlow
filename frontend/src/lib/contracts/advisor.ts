import { z } from 'zod';
import { uuid } from './auth';
import { ownerListQuery } from './owner';

export const teamReadQuery = ownerListQuery.extend({ scope: z.enum(['technicians', 'parts']).optional() }).strict();
export const technicianChoicesOutput = z.object({
  items: z.array(z.object({ userId: uuid, fullName: z.string().nullable() }).strict()),
  page: z.number().int().positive(), pageSize: z.literal(50), total: z.number().int().nonnegative(),
}).strict();
export const partsChoicesOutput = technicianChoicesOutput;
