import type { ShopDetail } from '@/lib/api/shops';
export const shopId = 'b1100000-0000-4000-8000-000000001001';
export const serviceId = 'b1100000-0000-4000-8000-000000003001';
export const slotId = 'b1100000-0000-4000-8000-000000004001';
export const fixtureShop: ShopDetail = {
  id: shopId, slug: 'test-workshop', name: 'Test Workshop', city: 'Lahore', address: 'Test Road', phone: '+924235751001',
  timezone: 'Asia/Karachi', workingHours: { mon: [['09:00', '12:00'], ['13:00', '18:00']], tue: [] },
  slotDurationMinutes: 60, slotCapacity: 1, logoUrl: null,
  services: { items: [{ id: serviceId, shopId, name: 'Brake inspection', description: 'Inspect braking components.', durationMinutes: 60, basePricePkr: 1500 }], page: 1, pageSize: 50, total: 1 },
};
