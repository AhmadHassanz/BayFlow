import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { demoShop, hasDemoCredentials, login, confirm, openRecord, requireDemoWrites } from './helpers';

test('I01 real booking and technician assignment survive hard reload in two sessions', async ({ browser }, info) => {
  test.skip(process.env.BAYFLOW_E2E_DEMO_WRITES !== '1', 'Explicit demo-write opt-in is required. This test leaves one real assigned QA booking.');
  test.skip(!hasDemoCredentials(), 'Configure private B11 demo credentials.');
  requireDemoWrites();

  const customerContext = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' });
  const advisorContext = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' });
  const customer = await customerContext.newPage();
  const advisor = await advisorContext.newPage();
  try {
    await login(customer, 'customer.a');
    await customer.goto(`/book/${demoShop}`);
    await customer.getByLabel(/Not sure/).check();
    await customer.getByLabel(/What are you noticing/).fill(`I01 QA ${randomUUID().slice(0, 8)}: steering vibration during braking.`);
    await customer.getByRole('button', { name: /Continue/ }).click();

    const dates = await customer.getByLabel(/Appointment date/).locator('option').evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
    let selected = false;
    for (const date of dates) {
      const available = await customer.request.get(`/api/v1/shops/${demoShop}/slots?date=${date}`);
      const result = await available.json();
      if (available.ok() && Array.isArray(result.data) && result.data.some((slot: { capacityRemaining: number }) => slot.capacityRemaining > 0)) {
        await customer.getByLabel(/Appointment date/).selectOption(date);
        const slot = customer.locator('.slot-option:not([disabled])').first();
        await expect(slot).toBeVisible();
        await slot.click();
        selected = true;
        break;
      }
    }
    expect(selected, 'The real demo shop must have a future capacity slot.').toBe(true);

    await customer.getByRole('button', { name: /Continue/ }).click();
    await customer.getByLabel(/Registration plate/).fill(`I01-${randomUUID().slice(0, 8)}`);
    await customer.getByLabel('Make', { exact: false }).fill('Toyota');
    await customer.getByLabel('Model', { exact: false }).fill('Corolla');
    await customer.getByLabel('Year', { exact: false }).fill('2018');
    await customer.getByRole('button', { name: /Continue/ }).click();
    await customer.getByRole('button', { name: /Continue/ }).click();
    const created = customer.waitForResponse(response => response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
    await customer.getByRole('button', { name: /Confirm booking/ }).click();
    const creation = await (await created).json();
    expect(creation.error).toBeNull();
    const bookingId: string = creation.data.id;

    await customer.goto(`/customer/bookings/${bookingId}`);
    await customer.reload();
    await expect(customer.getByRole('heading', { name: 'Awaiting confirmation', exact: true, level: 2 })).toBeVisible();

    await login(advisor, 'advisor.a');
    await openRecord(advisor, bookingId);
    await advisor.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    await confirm(advisor);
    await advisor.reload();
    await expect(advisor.getByRole('heading', { name: 'Visit confirmed', exact: true, level: 2 })).toBeVisible();

    const technicians = await (await advisor.request.get(`/api/v1/shops/${demoShop}/team?scope=technicians&page=1`)).json();
    expect(technicians.error).toBeNull();
    expect(technicians.data.items.length).toBeGreaterThan(0);
    const technicianId: string = technicians.data.items[0].userId;
    await advisor.getByLabel('Active technician').selectOption(technicianId);
    await advisor.getByRole('button', { name: 'Assign technician', exact: true }).click();
    await confirm(advisor);
    await advisor.reload();
    await expect(advisor.getByRole('heading', { name: 'Technician assigned', exact: true, level: 2 })).toBeVisible();

    await customer.reload();
    await expect(customer.getByRole('heading', { name: 'Technician assigned', exact: true, level: 2 })).toBeVisible();
  } finally {
    await Promise.all([customerContext.close(), advisorContext.close()]);
  }
});
