import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { demoShop, hasDemoCredentials, login, confirm, openRecord, capture, requireDemoWrites } from './helpers';

test('real seeded-role booking, rejection/revision, QC failure/rework and pickup persist across reload', async ({ browser }, info) => {
  test.setTimeout(process.env.BAYFLOW_I04_PUBLIC === '1' ? 20 * 60_000 : 180_000);
  test.skip(process.env.BAYFLOW_E2E_DEMO_WRITES !== '1', 'Explicit demo-write opt-in is required. This test leaves a real completed QA booking.');
  test.skip(!hasDemoCredentials(), 'Configure private B11 demo credentials.'); requireDemoWrites();
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' })));
  const [customer, advisor, tech, parts, qc, foreignCustomer] = await Promise.all(contexts.map(context => context.newPage()));
  const includeParts = process.env.BAYFLOW_E2E_PARTS === '1';
  let quotedPartsTotal = 0;
  try {
    const ownerContext = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' });
    try {
      const owner = await ownerContext.newPage(); await login(owner, 'owner.a');
      await owner.goto(`/shops/${demoShop}/settings`);
      await owner.getByRole('button', { name: 'Hours', exact: true }).click();
      await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(owner.getByText('Hours and appointment settings saved.', { exact: true })).toBeVisible();
    } finally { await ownerContext.close(); }
    await login(customer, 'customer.a'); await customer.goto(`/book/${demoShop}`);
    await customer.getByLabel(/Not sure/).check(); await customer.getByLabel(/What are you noticing/).fill(`F13 QA ${randomUUID().slice(0, 8)}: belt squeals during a cold start.`);
    await customer.getByRole('button', { name: /Continue/ }).click();
    await expect(customer.getByLabel(/Appointment date/)).toBeVisible();
    const dates = await customer.getByLabel(/Appointment date/).locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    let selected = false;
    for (const date of dates) {
      const available = await customer.request.get(`/api/v1/shops/${demoShop}/slots?date=${date}`);
      const result = await available.json();
      if (available.ok() && Array.isArray(result.data) && result.data.some((slot: { capacityRemaining: number }) => slot.capacityRemaining > 0)) {
        await customer.getByLabel(/Appointment date/).selectOption(date);
        const slots = customer.locator('.slot-option:not([disabled])');
        await expect(slots.first()).toBeVisible(); await slots.first().click(); selected = true; break;
      }
    }
    expect(selected, 'The real demo shop must have a future capacity slot.').toBe(true);
    await customer.getByRole('button', { name: /Continue/ }).click();
    await customer.getByLabel(/Registration plate/).fill(`F13-${randomUUID().slice(0, 8)}`);
    await customer.getByLabel('Make', { exact: false }).fill('Honda'); await customer.getByLabel('Model', { exact: false }).fill('Civic'); await customer.getByLabel('Year', { exact: false }).fill('2016');
    await customer.getByRole('button', { name: /Continue/ }).click(); await customer.getByRole('button', { name: /Continue/ }).click();
    const created = customer.waitForResponse(response => response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
    await customer.getByRole('button', { name: /Confirm booking/ }).click();
    const body = await (await created).json(); expect(body.error).toBeNull(); const bookingId: string = body.data.id;
    await customer.goto(`/customer/bookings/${bookingId}`); await capture(customer, info, 'customer-booking');
    await login(advisor, 'advisor.a'); await openRecord(advisor, bookingId);
    await advisor.getByRole('button', { name: 'Confirm booking', exact: true }).click(); await confirm(advisor);
    await login(tech, 'technician.a'); const techIdentity = await (await tech.request.get('/api/v1/me')).json();
    await login(parts, 'parts.a'); const partsIdentity = await (await parts.request.get('/api/v1/me')).json();
    await advisor.getByLabel('Active technician').selectOption(techIdentity.data.user.id); await advisor.getByRole('button', { name: 'Assign technician', exact: true }).click(); await confirm(advisor);
    await openRecord(tech, bookingId); await tech.getByRole('button', { name: 'Start inspection', exact: true }).click(); await confirm(tech);
    await tech.getByLabel('Diagnosis notes').fill('F13 QA physical inspection: belt fitting and road test required.');
    await tech.getByLabel('Item 1 description').fill('Belt fitting and road test labour'); await tech.getByLabel('Item 1 unit price (PKR)').fill('1500');
    if (includeParts) {
      const inventory = await (await parts.request.get(`/api/v1/shops/${demoShop}/inventory?page=1`)).json();
      const part = inventory.data.items.find((item: { active: boolean; quantityOnHand: number; unitCostPkr: number }) => item.active && (item.quantityOnHand + 2) * item.unitCostPkr + 1800 <= 2147483647);
      expect(part, 'The real demo inventory must contain an active part with safe quote bounds.').toBeTruthy();
      await tech.getByRole('button', { name: 'Add part', exact: true }).click(); await tech.getByRole('button', { name: 'Select part for item 2' }).click();
      await tech.getByRole('button', { name: `Select ${part.name}`, exact: true }).click();
      await tech.getByLabel('Item 2 quantity').fill(String(part.quantityOnHand + 2)); await tech.getByLabel('Item 2 unit price (PKR)').fill(String(part.unitCostPkr));
      quotedPartsTotal = (part.quantityOnHand + 2) * part.unitCostPkr;
    }
    await tech.getByRole('button', { name: 'Submit estimate for review', exact: true }).click(); await confirm(tech);
    await openRecord(advisor, bookingId); await advisor.getByRole('button', { name: 'Review and edit estimate' }).click();
    await advisor.locator('.advisor-review-editor .estimate-rows > li').filter({ hasText: '· Labour' }).first().getByLabel(/unit price \(PKR\)/).fill('1800'); await advisor.getByRole('button', { name: 'Send estimate to customer' }).click(); await confirm(advisor);
    await login(foreignCustomer, 'customer.b'); await foreignCustomer.goto(`/customer/bookings/${bookingId}`); await expect(foreignCustomer.getByText('Record unavailable.')).toBeVisible();
    await customer.reload(); await customer.getByText('Decline this estimate').click(); await customer.getByLabel('Reason for declining (optional)').fill('Please review the labour price.');
    await customer.getByRole('button', { name: 'Decline estimate', exact: true }).click(); await confirm(customer);
    await openRecord(advisor, bookingId); await advisor.getByRole('button', { name: 'Review and edit estimate' }).click(); await advisor.locator('.advisor-review-editor .estimate-rows > li').filter({ hasText: '· Labour' }).first().getByLabel(/unit price \(PKR\)/).fill('1200');
    await advisor.getByRole('button', { name: 'Create revised estimate', exact: true }).click(); await confirm(advisor);
    await advisor.getByRole('button', { name: 'Review and edit estimate' }).click(); await advisor.getByRole('button', { name: 'Send estimate to customer' }).click(); await confirm(advisor);
    await customer.reload(); const total = new Intl.NumberFormat('en-PK').format(quotedPartsTotal + 1200);
    await customer.getByRole('button', { name: `Approve estimate · PKR ${total}` }).click(); await confirm(customer);
    await openRecord(advisor, bookingId); await advisor.getByLabel('Active parts person').selectOption(partsIdentity.data.user.id); await advisor.getByRole('button', { name: 'Assign parts person' }).click(); await confirm(advisor);
    await openRecord(parts, bookingId);
    if (includeParts) {
      await parts.getByLabel(/^Order quantity /).fill('2'); await parts.getByLabel('Supplier name (optional)').fill('F13 demo QA supplier');
      await parts.getByRole('button', { name: 'Order missing parts' }).click(); await confirm(parts);
      await parts.getByLabel(/^Delivered now /).fill('1'); await parts.getByRole('button', { name: 'Receive this delivery' }).click(); await confirm(parts);
      await expect(parts.getByRole('heading', { name: 'Parts on order', exact: true, level: 2 })).toBeVisible();
      await parts.getByLabel(/^Delivered now /).fill('1'); await parts.getByRole('button', { name: 'Receive this delivery' }).click(); await confirm(parts);
    } else { await parts.getByRole('button', { name: 'Mark parts ready' }).click(); await confirm(parts); }
    await parts.getByRole('button', { name: 'Allocate parts and release to repair' }).click(); await confirm(parts);
    await openRecord(tech, bookingId); await tech.getByLabel('Repair notes').fill('F13 QA repair completed and road tested.'); await tech.getByRole('button', { name: 'Complete repair and send to QC' }).click(); await confirm(tech);
    await login(qc, 'qc.a'); await openRecord(qc, bookingId); await qc.getByRole('button', { name: 'Claim quality inspection', exact: true }).click(); await confirm(qc);
    await qc.getByRole('button', { name: 'Record inspection checks' }).click(); await qc.getByLabel('Check 1 name').fill('Road test'); await qc.getByLabel('Check 1 result').selectOption('FAIL');
    await qc.getByLabel('Issue title').fill('F13 QA rework check'); await qc.getByLabel('Issue description').fill('Belt noise needs another fitting check after the road test.'); await qc.getByRole('button', { name: 'Fail quality inspection', exact: true }).click(); await confirm(qc);
    await openRecord(tech, bookingId); await tech.getByLabel('Repair notes').fill('F13 QA fitting adjusted and repeat road test passed.'); await tech.getByRole('button', { name: 'Resubmit repair for QC' }).click(); await confirm(tech);
    await openRecord(qc, bookingId); await qc.getByRole('button', { name: 'Claim quality inspection', exact: true }).click(); await confirm(qc);
    await qc.getByRole('button', { name: 'Record inspection checks' }).click(); await qc.getByLabel('Check 1 name').fill('Road test'); await qc.getByLabel('Check 1 result').selectOption('PASS');
    await qc.getByRole('button', { name: 'Pass quality inspection', exact: true }).click(); await confirm(qc);
    await openRecord(advisor, bookingId); await advisor.getByRole('button', { name: 'Notify customer ready' }).click(); await confirm(advisor);
    await customer.reload(); await customer.getByRole('button', { name: 'Confirm vehicle pickup', exact: true }).click(); await confirm(customer); await customer.reload();
    await expect(customer.getByRole('heading', { name: 'Completed', exact: true, level: 2 })).toBeVisible(); await capture(customer, info, 'completed-qa-visit');
    await expect(customer.getByRole('button', { name: 'Confirm vehicle pickup', exact: true })).toHaveCount(0);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
