import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Existing B11 fixture identity, not an invented production tenant/account.
export const demoShop = 'b1100000-0000-4000-8000-000000001001';
export const foreignShop = 'b1100000-0000-4000-8000-000000001002';
export const roles = ['customer.a', 'owner.a', 'advisor.a', 'technician.a', 'parts.a', 'qc.a'] as const;
export type DemoRole = typeof roles[number] | 'customer.b' | 'qc.b';
function envValue(text: string, key: string) {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`);
  const raw = text.split(/\r?\n/).map(line => line.match(pattern)).find(Boolean)?.[1]?.trim() ?? '';
  return raw.replace(/^(['"])(.*)\1$/, '$2');
}
export function hasDemoCredentials() {
  return !!process.env.BAYFLOW_DEMO_PASSWORD || existsSync(resolve('../backend/.env.b11-demo.local'));
}
function demoPassword() {
  const privateFile = resolve('../backend/.env.b11-demo.local');
  const text = existsSync(privateFile) ? readFileSync(privateFile, 'utf8') : '';
  const password = process.env.BAYFLOW_DEMO_PASSWORD || envValue(text, 'BAYFLOW_DEMO_PASSWORD');
  if (password.length < 12 || password.length > 128) throw new Error('Configure B11 demo credentials privately before authenticated QA.');
  return password;
}
export function requireDemoWrites() {
  if (process.env.BAYFLOW_E2E_DEMO_WRITES !== '1') throw new Error('Live workflow QA requires explicit BAYFLOW_E2E_DEMO_WRITES=1.');
  const publicFile = resolve('.env.local');
  const text = existsSync(publicFile) ? readFileSync(publicFile, 'utf8') : '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envValue(text, 'NEXT_PUBLIC_SUPABASE_URL');
  if (url !== 'https://tlqvlsrmxueuuzxyltej.supabase.co') throw new Error('Live workflow QA is restricted to the known B11 demo project.');
  const host = new URL(process.env.BAYFLOW_E2E_BASE_URL ?? 'http://localhost:3104').hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error('Demo workflow QA requires the local application server, not a remote deployment.');
}
export async function login(page: Page, role: DemoRole) {
  try {
    await page.goto('/login');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(page.url()).hostname)) throw new Error('Authenticated demo QA requires the local application server.');
    await page.getByLabel('Email address').fill(`demo-${role}@bayflow.example.test`);
    await page.getByLabel('Password').fill(demoPassword());
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  } catch { throw new Error(`B11 ${role} sign-in failed. Check private credentials/session configuration; original auth errors are not printed.`); }
}
export async function confirm(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
export async function openRecord(page: Page, bookingId: string) {
  await page.goto(`/shops/${demoShop}/bookings/${bookingId}`);
  await expect(page.getByRole('heading', { name: 'Booking record.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh record/ })).toBeVisible();
}
export async function capture(page: Page, info: TestInfo, label: string) {
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
}
export async function noHorizontalPageOverflow(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; });
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1);
  expect(overflow, 'Only labelled table regions should scroll horizontally, not the whole page.').toBe(false);
}
