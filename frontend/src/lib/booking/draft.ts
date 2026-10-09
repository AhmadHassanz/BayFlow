import { z } from 'zod';
import { createBookingInput, bookingCreationOutput, type CreateBookingInput } from '@/lib/contracts/bookings';

export const bookingFormOutput = z.object({
  serviceIds: z.array(z.uuid()).max(50), notSure: z.boolean(), symptomNotes: z.string().max(4000),
  date: z.string().max(10), slotId: z.union([z.uuid(), z.literal('')]),
  registrationPlate: z.string().max(20), make: z.string().max(80), model: z.string().max(80),
  year: z.string().max(4), color: z.string().max(40), mileageKm: z.string().max(10),
}).strict();
export type BookingFormValues = z.infer<typeof bookingFormOutput>;
export const emptyBookingForm: BookingFormValues = { serviceIds: [], notSure: false, symptomNotes: '', date: '', slotId: '', registrationPlate: '', make: '', model: '', year: '', color: '', mileageKm: '' };
export const pendingIntentOutput = z.object({ actorId: z.uuid(), payload: createBookingInput }).strict();
export type PendingIntent = z.infer<typeof pendingIntentOutput>;
export const savedDraftOutput = z.object({
  version: z.literal(1), shopId: z.uuid(), savedAt: z.number(), step: z.number().int().min(0).max(4),
  values: bookingFormOutput, pending: pendingIntentOutput.nullable(), receipt: bookingCreationOutput.nullable(),
}).strict().refine(value => (!value.pending || value.pending.payload.shopId === value.shopId) && (!value.receipt || value.receipt.shopId === value.shopId), 'Draft belongs to another workshop.');
export type SavedDraft = z.infer<typeof savedDraftOutput>;
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const draftKey = (shopId: string) => `bayflow:booking:v1:${shopId}`;

export function readDraft(storage: DraftStorage, shopId: string): SavedDraft | null {
  const value = storage.getItem(draftKey(shopId));
  if (!value) return null;
  try {
    const draft = savedDraftOutput.parse(JSON.parse(value));
    return draft.shopId === shopId ? draft : null;
  } catch { return null; }
}
export function writeDraft(storage: DraftStorage, draft: SavedDraft) {
  storage.setItem(draftKey(draft.shopId), JSON.stringify(savedDraftOutput.parse(draft)));
}
export function clearDraft(storage: DraftStorage, shopId: string) { storage.removeItem(draftKey(shopId)); }

export function bookingPayload(shopId: string, values: BookingFormValues, key: string): CreateBookingInput {
  return createBookingInput.parse({
    shopId, slotId: values.slotId, serviceIds: values.serviceIds, symptomNotes: values.symptomNotes,
    vehicle: { registrationPlate: values.registrationPlate, make: values.make, model: values.model,
      year: /^\d{4}$/.test(values.year) ? Number(values.year) : NaN, color: values.color.trim() || null,
      mileageKm: values.mileageKm.trim() === '' ? null : /^\d+$/.test(values.mileageKm) ? Number(values.mileageKm) : NaN },
    idempotencyKey: key,
  });
}

export function initialBookingValues(shopId: string, draft: SavedDraft | null, hints: { service?: string; date?: string; slot?: string }, dates: string[]) {
  if (draft?.shopId !== shopId) draft = null;
  const values = { ...(draft?.values ?? emptyBookingForm), serviceIds: [...(draft?.values.serviceIds ?? [])] };
  // A pending request is immutable; URL hints must never change its intent.
  if (!draft?.pending && !draft?.receipt) {
    if (hints.service && z.uuid().safeParse(hints.service).success) values.serviceIds = [...new Set([...values.serviceIds, hints.service])].slice(0, 50);
    if (hints.date && dates.includes(hints.date)) {
      values.date = hints.date;
      values.slotId = hints.slot && z.uuid().safeParse(hints.slot).success ? hints.slot : '';
    }
    if (!dates.includes(values.date)) { values.date = dates[0]; values.slotId = ''; }
  }
  return values;
}
