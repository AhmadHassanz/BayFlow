import { test, expect, type Page } from '@playwright/test';
import { demoShop, hasDemoCredentials, login, openRecord, requireDemoWrites } from './helpers';

async function actionResponse(page: Page) {
  return page.waitForResponse(response => response.url().includes('/api/v1/bookings/')
    && response.url().endsWith('/actions') && response.request().method() === 'POST');
}

test('I03 two stale advisor sessions yield one commit and one recoverable 409', async ({ browser }, info) => {
  test.skip(process.env.BAYFLOW_E2E_DEMO_WRITES !== '1', 'Explicit demo-write opt-in is required. This test confirms one retained QA booking.');
  test.skip(!hasDemoCredentials(), 'Private B11 demo credentials are required.');
  requireDemoWrites();
  const contexts = await Promise.all(Array.from({ length: 2 }, () =>
    browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' })));
  const [first, second] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    await Promise.all([login(first, 'advisor.a'), login(second, 'advisor.a')]);
    const queue = await (await first.request.get(`/api/v1/shops/${demoShop}/bookings?page=1&status=PENDING&assignee=all`)).json();
    const target = queue.data.items[0];
    expect(target, 'A retained pending disposable booking is required for the stale-tab rehearsal.').toBeTruthy();
    await Promise.all([openRecord(first, target.id), openRecord(second, target.id)]);
    await Promise.all([
      first.getByRole('button', { name: 'Confirm booking', exact: true }).click(),
      second.getByRole('button', { name: 'Confirm booking', exact: true }).click(),
    ]);
    const firstResponse = actionResponse(first);
    const secondResponse = actionResponse(second);
    await Promise.all([
      first.getByRole('dialog').getByRole('button', { name: 'Confirm change' }).click(),
      second.getByRole('dialog').getByRole('button', { name: 'Confirm change' }).click(),
    ]);
    const responses = await Promise.all([firstResponse, secondResponse]);
    expect(responses.map(response => response.status()).sort()).toEqual([201, 409]);

    const loser = responses[0].status() === 409 ? first : second;
    await expect(loser.getByText('This booking changed while you were working. Reload the record before choosing another action.')).toBeVisible();
    await loser.getByRole('button', { name: 'Reload record' }).click();
    await expect(loser.getByRole('heading', { name: 'Visit confirmed', exact: true, level: 2 })).toBeVisible();

    const authoritative = await (await first.request.get(`/api/v1/bookings/${target.id}`)).json();
    expect(authoritative.data.status).toBe('CONFIRMED');
    expect(authoritative.data.stateVersion).toBe(target.stateVersion + 1);
    expect(authoritative.data.history.filter((entry: { action: string }) => entry.action === 'CONFIRM_BOOKING')).toHaveLength(1);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
