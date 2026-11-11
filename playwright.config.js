import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // В этом окружении используем установленный Chrome; по умолчанию — Chromium Playwright.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: process.env.LUMO_TEST_SERVE_SITE === '1' ? [{
    command: 'node server/test-server.js',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
  }] : [{
    command: 'node server/test-server.js',
    url: 'http://127.0.0.1:3002/api/health',
    reuseExistingServer: false,
  }, {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    env: { LUMO_API_PROXY: 'http://127.0.0.1:3002' },
    reuseExistingServer: !process.env.CI,
  }],
});
