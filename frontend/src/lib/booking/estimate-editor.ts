import { estimatePayload } from '@/lib/contracts/booking-actions';
import type { CatalogPart } from '@/lib/contracts/technician';

export type EstimateRow = { key: string; kind: 'PART' | 'LABOUR'; part: CatalogPart | null;
  description: string; quantity: string; price: string };
const whole = /^[0-9]{1,9}$/;
export function estimatePreview(rows: EstimateRow[]) {
  let total = 0n;
  for (const row of rows) {
    if (!whole.test(row.quantity) || !whole.test(row.price) || BigInt(row.quantity) < 1n) return null;
    total += BigInt(row.quantity) * BigInt(row.price);
  }
  return total;
}
export function buildEstimatePayload(diagnosis: string, rows: EstimateRow[]) {
  const total = estimatePreview(rows);
  if (total === null) throw new Error('Every quantity must be a positive whole number and every price a nonnegative whole PKR amount, up to 999999999.');
  if (total > 2147483647n) throw new Error('The estimate exceeds the server limit of PKR 2,147,483,647. Reduce the quantities or prices.');
  if (rows.some(row => row.kind === 'PART' && !row.part)) throw new Error('Select a workshop catalog part for every PART item.');
  const parsed = estimatePayload.safeParse({
      diagnosisNote: diagnosis, items: rows.map(row => ({ kind: row.kind, partId: row.kind === 'PART' ? row.part?.id : null,
        descriptionSnapshot: row.description, quantity: Number(row.quantity), unitPricePkr: Number(row.price) })),
    });
  if (!parsed.success) throw new Error('Enter a diagnosis of 3–4000 characters, 1–100 items, and a description of 1–500 characters for every item.');
  return parsed.data;
}
