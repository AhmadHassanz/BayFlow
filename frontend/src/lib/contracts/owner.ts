import { z } from 'zod';
import { shopOutput, serviceOutput, servicesQuery } from './shops';
import { membershipOutput } from './auth';

const count = z.number().int().nonnegative();
export const bookingCounts = z.object({ pending: count, inProgress: count, readyForPickup: count, completed: count });
export const ownerShopOutput = z.object({ shop: shopOutput, counts: bookingCounts });
const pageFields = { page: z.number().int().positive(), pageSize: z.literal(50), total: count };
export const ownerShopsOutput = z.object({ items: z.array(ownerShopOutput), ...pageFields });
export const ownerServicesOutput = z.object({ items: z.array(serviceOutput), ...pageFields });
export const teamMemberOutput = membershipOutput.extend({ fullName: z.string().nullable() });
export const teamListOutput = z.object({ items: z.array(teamMemberOutput), ...pageFields });
export const ownerListQuery = servicesQuery;
export const servicesReadQuery = servicesQuery.extend({ scope: z.literal('owner').optional() }).strict();
export type OwnerShop = z.infer<typeof ownerShopOutput>;
export type TeamMember = z.infer<typeof teamMemberOutput>;
