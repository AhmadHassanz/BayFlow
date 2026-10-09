import { z } from 'zod';

export const uuid = z.uuid();
export const staffRole = z.enum(['SA', 'TECHNICIAN', 'PARTS', 'QC']);
const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(12).max(128);
export const loginInput = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const signupInput = z.object({ email, password, fullName: z.string().trim().min(1).max(120) }).strict();
export const createStaffInput = z.object({ email, fullName: z.string().trim().min(1).max(120), role: staffRole, initialPassword: password }).strict();
export const editStaffInput = z.object({ role: staffRole.optional(), active: z.boolean().optional() })
  .strict().refine(value => value.role !== undefined || value.active !== undefined, 'Provide role or active.');
export const membershipOutput = z.object({ id: uuid, shopId: uuid, userId: uuid, role: z.enum(['OWNER', 'SA', 'TECHNICIAN', 'PARTS', 'QC']), active: z.boolean() });
export const profileOutput = z.object({ id: uuid, fullName: z.string(), phone: z.string().nullable() });
export type Membership = z.infer<typeof membershipOutput>;
