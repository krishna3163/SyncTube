import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use the Chromium revision installed by Playwright rather than a
        // machine-specific system Chrome path.
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build:extension && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
