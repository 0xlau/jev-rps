import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60000,
    env: { GAME_SECRET: 'playwright-server-only-test-secret-never-production' } },
});
