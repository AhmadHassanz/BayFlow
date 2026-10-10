import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { demoShop, foreignShop, hasDemoCredentials, login } from './helpers';

test('I02 foreign identities and forged workflow fields are denied without changing the booking', async ({ browser }, info) => {
  test.skip(!hasDemoCredentials(), 'Private B11 demo credentials are required for authenticated security rehearsal.');
  const contexts = await Promise.all(Array.from({ length: 4 }, () =>
    browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' })));
  const [customerA, customerB, advisorA, technicianA] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    await login(customerA, 'customer.a');
    const listResponse = await customerA.request.get('/api/v1/me/bookings');
    expect(listResponse.status()).toBe(200);
    const list = await listResponse.json();
    const target = list.data.find((item: { shopId: string; status: string; technicianUserId: string | null }) =>
      item.shopId === demoShop && item.status === 'PENDING' && item.technicianUserId === null);
    expect(target, 'I01 retained a pending unassigned disposable booking for the security rehearsal.').toBeTruthy();
    const beforeResponse = await customerA.request.get(`/api/v1/bookings/${target.id}`);
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()).data;

    await login(customerB, 'customer.b');
    const foreignCustomer = await customerB.request.get(`/api/v1/bookings/${target.id}`);
    expect([403, 404]).toContain(foreignCustomer.status());
    await customerB.goto(`/customer/bookings/${target.id}`);
    await expect(customerB.getByText('Record unavailable.')).toBeVisible();

    await login(technicianA, 'technician.a');
    const unassignedTechnician = await technicianA.request.get(`/api/v1/bookings/${target.id}`);
    expect([403, 404]).toContain(unassignedTechnician.status());

    await login(advisorA, 'advisor.a');
    const foreignShopRead = await advisorA.request.get(`/api/v1/shops/${foreignShop}/bookings?page=1&assignee=all`);
    expect([403, 404]).toContain(foreignShopRead.status());
    await advisorA.goto(`/shops/${foreignShop}/advisor`);
    await expect(advisorA.getByText(/unavailable|not found/i).first()).toBeVisible();

    const forged = await advisorA.request.post(`/api/v1/bookings/${target.id}/actions`, {
      headers: { Origin: new URL(advisorA.url()).origin },
      data: {
        action: 'CONFIRM_BOOKING', expectedVersion: before.stateVersion, payload: {},
        idempotencyKey: randomUUID(), nextStatus: 'COMPLETED', role: 'OWNER', shopId: foreignShop,
      },
    });
    expect(forged.status()).toBe(400);

    const afterResponse = await customerA.request.get(`/api/v1/bookings/${target.id}`);
    expect(afterResponse.status()).toBe(200);
    const after = (await afterResponse.json()).data;
    expect({ status: after.status, stateVersion: after.stateVersion, history: after.history })
      .toEqual({ status: before.status, stateVersion: before.stateVersion, history: before.history });
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
