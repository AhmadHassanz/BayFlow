import { defineConfig } from '@playwright/test';

const baseURL = process.env.BAYFLOW_E2E_BASE_URL ?? 'http://localhost:3104';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 180000, expect: { timeout: 15000 }, reporter: 'line',
  outputDir: './test-results',
  use: { baseURL, channel: 'chromium', headless: true, trace: 'off', video: 'off', screenshot: 'off', timezoneId: 'Asia/Karachi' },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  // Explicit opt-in only: listing/typechecking tests never starts a server/browser.
  webServer: process.env.BAYFLOW_E2E_START_SERVER === '1' ? {
    command: 'node scripts/e2e-server.mjs',
    url: baseURL, reuseExistingServer: false, timeout: 120000,
  } : undefined,
});
