import type { JobRecord } from './advisor-actions';
import { latestEstimate } from './estimate-review';
export function procurementRows(booking: JobRecord) {
  const estimate = latestEstimate(booking);
  if (!estimate || estimate.state !== 'APPROVED') return null;
  const requirements = new Map<string, number>();
  for (const item of estimate.items) if (item.kind === 'PART' && item.partId)
    requirements.set(item.partId, (requirements.get(item.partId) ?? 0) + item.quantity);
  if (requirements.size !== booking.requiredParts.length || booking.requiredParts.some(part => requirements.get(part.partId) !== part.quantityRequired)) return null;
  if (booking.purchaseOrders.some(order => order.shopId !== booking.shopId || order.bookingId !== booking.id)) return null;
  return booking.requiredParts.map(part => {
    const outstanding = booking.purchaseOrders.flatMap(order => order.items).filter(item => item.partId === part.partId)
      .reduce((total, item) => total + item.quantityOrdered - item.quantityReceived, 0);
    return { ...part, name: estimate.items.find(item => item.partId === part.partId)?.descriptionSnapshot ?? part.partId,
      outstanding, uncovered: Math.max(0, part.quantityRequired - part.quantityOnHand - outstanding) };
  });
}
export function selectedPartQuantities(values: Record<string, string>, limits: Map<string, number>) {
  const items = [];
  for (const [partId, text] of Object.entries(values)) {
    if (!limits.has(partId)) throw new Error('Choose only parts on this request.');
    const value = text.trim();
    if (!value || value === '0') continue;
    if (!/^[0-9]{1,9}$/.test(value) || Number(value) < 1 || Number(value) > limits.get(partId)!)
      throw new Error('Enter whole quantities up to the displayed remaining amount.');
    items.push({ partId, quantity: Number(value) });
  }
  if (!items.length || items.length > 100) throw new Error('Enter a positive quantity for 1–100 parts.');
  return items;
}
