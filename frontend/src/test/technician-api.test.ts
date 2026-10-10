import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { getBooking } from '@/server/services/booking-actions';
import { listEstimateCatalog } from '@/server/services/technician';
import { buildEstimatePayload, estimatePreview, type EstimateRow } from '@/lib/booking/estimate-editor';
import type { createClient } from '@/lib/supabase/server';
const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
import { GET } from '@/app/api/v1/bookings/[id]/estimate-catalog/route';
const id = 'b1100000-0000-4000-8000-000000000101';
const shopId = 'b1100000-0000-4000-8000-000000001001';
const customerId = 'b1100000-0000-4000-8000-000000000003';
const vehicleId = 'b1100000-0000-4000-8000-000000002001';
type Client = Awaited<ReturnType<typeof createClient>>;
const booking = { id, shopId, customerId, vehicleId, slotId: vehicleId, status: 'INSPECTING', stateVersion: 3,
  symptomNotes: 'Brake concern', serviceIds: [], createdAt: '2026-10-10T10:00:00Z', technicianUserId: customerId, partsUserId: null,
  qcClaimedBy: null, completedAt: null, history: [] };
const params = { params: Promise.resolve({ id }) };
const request = (query = '') => new Request(`http://localhost:3000/api/v1/bookings/${id}/estimate-catalog${query}`);
beforeEach(() => vi.resetAllMocks());
it('reads the bounded catalog through the verified user client and returns safe no-store DTOs', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { items: [{ id: vehicleId, sku: 'PAD', name: 'Brake pads' }], page: 2, pageSize: 50, total: 51 }, error: null });
  mocks.identity.mockResolvedValue({ client: { rpc } });
  const response = await GET(request('?page=2'), params);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('list_estimate_catalog', { input: { bookingId: id, page: 2 } });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect((await response.json()).data.items).toEqual([{ id: vehicleId, sku: 'PAD', name: 'Brake pads' }]);
});
it('rejects unknown/duplicate keys, invalid IDs and invalid pages before private queries', async () => {
  for (const query of ['?page=1&page=2', '?shopId=forged', '?page=0', '?page=1.5', '?page=100000'])
    expect((await GET(request(query), params)).status).toBe(400);
  expect((await GET(request(), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it('handles missing Auth and hidden/unassigned/foreign bookings without exposing SQL', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Sign in'));
  expect((await GET(request(), params)).status).toBe(401);
  mocks.identity.mockResolvedValue({ client: { rpc: vi.fn().mockResolvedValue({ error: { code: 'P0002', message: 'PRIVATE SQL' } }) } });
  const response = await GET(request(), params);
  expect(response.status).toBe(404);
  expect(JSON.stringify(await response.json())).not.toContain('PRIVATE SQL');
});
it('requires the exact minimal catalog response schema and safe RPC errors', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { items: [{ id, sku: 'SKU', name: 'Part', unitCostPkr: 10 }], page: 1, pageSize: 50, total: 1 }, error: null });
  const client = { rpc } as unknown as Client;
  await expect(listEstimateCatalog(client, id, 1)).rejects.toThrow();
  rpc.mockResolvedValue({ error: { code: '42501' } });
  await expect(listEstimateCatalog(client, id, 1)).rejects.toMatchObject({ status: 403 });
});
function contextClient(profileResult: unknown, vehicleResult: unknown) {
  const profile = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(profileResult) };
  const vehicle = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(vehicleResult) };
  const rpc = vi.fn().mockResolvedValue({ data: booking, error: null });
  const from = vi.fn((table: string) => table === 'profiles' ? profile : vehicle);
  return { profile, vehicle, rpc, from, client: { rpc, from } as unknown as Client };
}
it('authorizes booking before reading bound customer/vehicle context and maps only approved fields', async () => {
  const fixture = contextClient({ data: { full_name: 'Customer', phone: null, email: 'PRIVATE' }, error: null },
    { data: { registration_plate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileage: 50000, owner: 'PRIVATE' }, error: null });
  const result = await getBooking(fixture.client, id);
  expect(result.customer).toEqual({ fullName: 'Customer', phone: null });
  expect(result.vehicle).toEqual({ registrationPlate: 'LEA-1234', make: 'Honda', model: 'Civic', year: 2016, color: null, mileageKm: 50000 });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(fixture.profile.eq).toHaveBeenCalledWith('id', customerId);
  expect(fixture.vehicle.eq).toHaveBeenCalledWith('id', vehicleId);
  expect(fixture.vehicle.eq).toHaveBeenCalledWith('customer_id', customerId);
  expect(fixture.rpc.mock.invocationCallOrder[0]).toBeLessThan(fixture.from.mock.invocationCallOrder[0]);
  fixture.rpc.mockResolvedValue({ error: { code: 'P0002' }, data: null }); fixture.from.mockClear();
  await expect(getBooking(fixture.client, id)).rejects.toMatchObject({ status: 404 });
  expect(fixture.from).not.toHaveBeenCalled();
});
it('uses explicit null for missing context and fails instead of fabricating data on query errors', async () => {
  const absent = contextClient({ data: null, error: null }, { data: null, error: null });
  expect(await getBooking(absent.client, id)).toMatchObject({ customer: null, vehicle: null });
  const broken = contextClient({ data: null, error: { message: 'PRIVATE' } }, { data: null, error: null });
  await expect(getBooking(broken.client, id)).rejects.toMatchObject({ status: 500, code: 'DATABASE_ERROR' });
});
const row: EstimateRow = { key: 'test', kind: 'LABOUR', part: null, description: 'Inspection labour', quantity: '2', price: '900' };
it('calculates whole-PKR previews exactly, accepts zero prices and never supplies authoritative totals', () => {
  expect(estimatePreview([row, { ...row, price: '6500' }])).toBe(14800n);
  expect(buildEstimatePayload(' Physical inspection ', [row, { ...row, price: '0' }])).toEqual({ diagnosisNote: 'Physical inspection',
    items: [{ kind: 'LABOUR', partId: null, descriptionSnapshot: 'Inspection labour', quantity: 2, unitPricePkr: 900 },
      { kind: 'LABOUR', partId: null, descriptionSnapshot: 'Inspection labour', quantity: 2, unitPricePkr: 0 }] });
});
it.each([{ price: '' }, { price: '9.50' }, { price: '-1' }, { price: '1e3' }, { quantity: '0' },
  { quantity: '1.5' }, { price: '1000000000' }, { quantity: '999999999', price: '999999999' }, { kind: 'PART' as const }, { description: '' }])
  ('rejects incomplete, fractional, out-of-range, missing-part and overflowing items %j', patch => {
    expect(() => buildEstimatePayload('Inspection', [{ ...row, ...patch }])).toThrow();
  });
it('rejects invalid diagnoses and oversized row lists and preserves catalog identity for PART items', () => {
  expect(() => buildEstimatePayload('no', [row])).toThrow();
  expect(() => buildEstimatePayload('Inspection', Array.from({ length: 101 }, () => row))).toThrow();
  const part = { id: vehicleId, sku: 'BELT', name: 'Drive belt' };
  expect(buildEstimatePayload('Inspection', [{ ...row, kind: 'PART', part }]).items[0]).toMatchObject({ partId: vehicleId, kind: 'PART' });
});
