import { z } from 'zod';
import { BookingReadError } from './booking';
import { workspaceRead } from './workspace';
import { ownerShopsOutput, ownerShopOutput, ownerServicesOutput, teamListOutput } from '@/lib/contracts/owner';
import { shopOutput, serviceOutput } from '@/lib/contracts/shops';
import { membershipOutput } from '@/lib/contracts/auth';

export const getOwnerShops = (page: number, signal: AbortSignal) => workspaceRead(`/api/v1/owner/shops?page=${page}`, ownerShopsOutput, signal);
export const getOwnerShop = (id: string, signal: AbortSignal) => workspaceRead(`/api/v1/owner/shops/${id}`, ownerShopOutput, signal);
export const getOwnerTeam = (id: string, page: number, signal: AbortSignal) => workspaceRead(`/api/v1/shops/${id}/team?page=${page}`, teamListOutput, signal);
export const getOwnerServices = (id: string, page: number, signal: AbortSignal) => workspaceRead(`/api/v1/shops/${id}/services?scope=owner&page=${page}`, ownerServicesOutput, signal);

async function mutate<T>(url: string, method: 'POST' | 'PATCH', input: unknown, schema: z.ZodType<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) {
      let code = 'REQUEST_FAILED';
      try { code = z.object({ error: z.object({ code: z.string() }) }).parse(await response.json()).error.code; } catch { /* Never show raw response bodies. */ }
      throw new BookingReadError(response.status, code);
    }
    return z.object({ data: schema, error: z.null() }).parse(await response.json()).data;
  } finally { clearTimeout(timer); }
}
export const saveOwnerShop = (id: string | null, input: unknown) => mutate(`/api/v1/owner/shops${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', input, shopOutput);
export const saveOwnerService = (shopId: string, id: string | null, input: unknown) => mutate(`/api/v1/shops/${shopId}/services${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', input, serviceOutput);
export const createOwnerStaff = (shopId: string, input: unknown) => mutate(`/api/v1/shops/${shopId}/team`, 'POST', input, membershipOutput);
export const editOwnerStaff = (shopId: string, id: string, input: unknown) => mutate(`/api/v1/shops/${shopId}/team/${id}`, 'PATCH', input, membershipOutput);

export function uncertainMutation(error: unknown) {
  return !(error instanceof BookingReadError) || error.status >= 500;
}
export function ownerFailure(error: unknown) {
  if (!(error instanceof BookingReadError)) return 'We could not verify the save. Refresh the records before trying again.';
  if (error.status === 401) return 'Your session expired. Sign in again before making changes.';
  if (error.status === 403 || error.status === 404) return 'You no longer have access to manage this record. Refresh or check your workshop.';
  if (error.code === 'SCHEDULE_CONFLICT') return 'Existing bookings conflict with these hours or capacity. Your settings were not changed. Keep their appointments available and try again.';
  if (error.code === 'SHOP_NOT_READY') return 'Complete the opening hours, add an active service, and create active Service Advisor, Technician, Parts and Quality Control accounts before publishing.';
  if (error.code === 'EMAIL_EXISTS') return 'That email already has an account. Its credentials were not changed. Use a new staff email.';
  if (error.code === 'STAFF_PROVISIONING_INCOMPLETE') return 'Staff setup needs operator review in Supabase. Do not submit another account request until its membership and activation are checked.';
  if (error.status === 429) return 'Too many requests. Wait a minute before trying again.';
  if (error.status === 400 || error.status === 422) return 'Check the highlighted fields and try again.';
  return 'We could not verify the save. Refresh the records and ask the workspace operator to review it before trying again.';
}
