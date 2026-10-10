import type { z } from 'zod';
import { estimatePayload, estimateOutput } from '@/lib/contracts/booking-actions';
import type { JobRecord } from './advisor-actions';
import { estimatePreview } from './estimate-editor';

export type EstimateSnapshot = z.infer<typeof estimateOutput>;
export type ReviewRow = { key: string; kind: 'PART' | 'LABOUR'; partId: string | null; description: string; quantity: string; price: string };
export type ReviewDraft = { source: EstimateSnapshot; version: number; diagnosis: string; rows: ReviewRow[] };

export function estimatesBelongToBooking(booking: JobRecord) {
  return booking.estimates.every(estimate => estimate.bookingId === booking.id && estimate.shopId === booking.shopId)
    && new Set(booking.estimates.map(estimate => estimate.revisionNo)).size === booking.estimates.length;
}
export function latestEstimate(booking: JobRecord) {
  if (!estimatesBelongToBooking(booking)) return null;
  return [...booking.estimates].sort((a, b) => b.revisionNo - a.revisionNo)[0] ?? null;
}
export function customerCanDecide(booking: JobRecord, customerId: string) {
  const latest = latestEstimate(booking);
  return booking.customerId === customerId && booking.status === 'AWAITING_CUSTOMER' &&
    latest?.state === 'SENT' && latest.sentAt !== null && latest.items.length > 0;
}
export function reviewDraft(booking: JobRecord, source: EstimateSnapshot): ReviewDraft {
  return { source, version: booking.stateVersion, diagnosis: source.diagnosisNote,
    rows: source.items.map(item => ({ key: item.id, kind: item.kind, partId: item.partId,
      description: item.descriptionSnapshot, quantity: String(item.quantity), price: String(item.unitPricePkr) })) };
}
export function reviewPreview(rows: ReviewRow[]) {
  return estimatePreview(rows.map(row => ({ ...row, part: null })));
}
export function buildReviewPayload(draft: ReviewDraft) {
  const total = reviewPreview(draft.rows);
  if (total === null) throw new Error('Use positive whole quantities and nonnegative whole PKR prices, up to 999999999.');
  if (total > 2147483647n) throw new Error('The estimate exceeds the server limit of PKR 2,147,483,647.');
  const sourceParts = new Set(draft.source.items.filter(item => item.kind === 'PART').map(item => item.partId));
  if (draft.rows.some(row => row.kind === 'PART' && (!row.partId || !sourceParts.has(row.partId))))
    throw new Error('Part identities must come from the recorded source estimate.');
  const parsed = estimatePayload.safeParse({ diagnosisNote: draft.diagnosis, items: draft.rows.map(row => ({
    kind: row.kind, partId: row.kind === 'PART' ? row.partId : null, descriptionSnapshot: row.description,
    quantity: Number(row.quantity), unitPricePkr: Number(row.price),
  })) });
  if (!parsed.success) throw new Error('Enter a diagnosis of 3–4000 characters, 1–100 items and an item description of 1–500 characters.');
  return parsed.data;
}
