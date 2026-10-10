import { z } from 'zod';
import { uuid } from './auth';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const windows = z.array(z.tuple([time, time])).max(4).refine(value =>
  value.every(([open, close], i) => open < close && (i === 0 || open >= value[i - 1][1])),
  'Hours must be ordered, non-overlapping and within one day.');
export const workingHours = z.object({ mon: windows.optional(), tue: windows.optional(), wed: windows.optional(),
  thu: windows.optional(), fri: windows.optional(), sat: windows.optional(), sun: windows.optional() }).strict();
const timezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Use a recognized timezone.');
const shopFields = z.object({ name: z.string().trim().min(1).max(120), city: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(500), phone: z.string().trim().regex(/^[+0-9][0-9 ()-]{6,29}$/),
  workingHours, timezone, slotDurationMinutes: z.number().int().min(15).max(240),
  slotCapacity: z.number().int().min(1).max(100), active: z.boolean() }).strict();
export const createShopInput = shopFields.omit({ active: true }).extend({
  timezone: timezone.default('Asia/Karachi'), slotDurationMinutes: shopFields.shape.slotDurationMinutes.default(60),
  slotCapacity: shopFields.shape.slotCapacity.default(1), active: z.boolean().default(false),
});
export const editShopInput = shopFields.partial().refine(value => Object.keys(value).length > 0, 'Provide settings.');
const serviceFields = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000),
  durationMinutes: z.number().int().min(1).max(1440), basePricePkr: z.number().int().min(0).max(999999999).nullable(),
  active: z.boolean() }).strict();
export const createServiceInput = serviceFields.extend({ description: serviceFields.shape.description.default(''),
  basePricePkr: serviceFields.shape.basePricePkr.default(null), active: z.boolean().default(true) });
export const editServiceInput = serviceFields.partial().refine(value => Object.keys(value).length > 0, 'Provide settings.');
export const shopOutput = shopFields.extend({ id: uuid, slug: z.string(), logoUrl: z.string().nullable() });
export const serviceOutput = serviceFields.extend({ id: uuid, shopId: uuid });
export const publicShopOutput = shopOutput.omit({ active: true });
export const publicServiceOutput = serviceOutput.omit({ active: true });
export const slotOutput = z.object({ id: uuid, shopId: uuid, startsAt: z.string(), endsAt: z.string(),
  capacity: z.number().int().positive(), capacityRemaining: z.number().int().nonnegative() });
const page = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1);
export const directoryQuery = z.object({ city: z.string().trim().max(80).optional(),
  q: z.string().trim().max(120).optional(), page }).strict();
export const servicesQuery = z.object({ page }).strict();
export const slotsQuery = z.object({ date: z.iso.date() }).strict();
export const slugInput = z.string().min(1).max(180).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export function queryObject(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1))
    throw new z.ZodError([{ code: 'custom', path: [], message: 'Duplicate query parameter.' }]);
  return Object.fromEntries(params);
}
export type ShopSettings = z.infer<typeof createShopInput>;
