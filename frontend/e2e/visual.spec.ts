import { test, expect } from '@playwright/test';
import { demoShop, foreignShop, hasDemoCredentials, login, roles, capture, noHorizontalPageOverflow } from './helpers';

test('public landing, wizard and keyboard signup validation are connected and fit the viewport', async ({ page }, info) => {
  const crashes: string[] = []; page.on('pageerror', error => crashes.push(error.name));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) crashes.push('Console error (content withheld)'); });
  await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Lahore Auto Care/ }).first()).toBeVisible();
  await noHorizontalPageOverflow(page); await capture(page, info, 'landing');
  await page.goto(`/book/${demoShop}`); await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await noHorizontalPageOverflow(page); await capture(page, info, 'wizard');
  await page.goto('/signup'); await page.getByRole('link', { name: /Customer/ }).click(); await page.getByLabel('Full name').focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).toBeFocused(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#auth-form-error')).toContainText('Enter your name'); expect(crashes).toEqual([]);
});
test('every seeded role has a real responsive workspace and unauthorized deep links are unavailable', async ({ browser }, info) => {
  test.skip(!hasDemoCredentials(), 'Private B11 demo credentials are required for authenticated viewport QA.');
  for (const role of roles) {
    const context = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'Asia/Karachi' });
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.name));
    page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push('Console error (content withheld)'); });
    try {
      await login(page, role); await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await noHorizontalPageOverflow(page); await capture(page, info, role.replace('.', '-'));
      if (role === 'advisor.a') { await page.goto(`/shops/${foreignShop}/advisor`); await expect(page.getByText(/unavailable|not found/i).first()).toBeVisible(); }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});
test('directory network failure and recovery are actionable without a fabricated record', async ({ page }) => {
  await page.route('**/api/v1/shops?*', route => route.abort()); await page.goto('/');
  const retry = page.getByRole('button', { name: /Try again/ }); await expect(retry).toBeVisible();
  await page.unroute('**/api/v1/shops?*'); await retry.click();
  await expect(page.getByRole('link', { name: /Lahore Auto Care/ }).first()).toBeVisible();
});
