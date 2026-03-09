import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4173;
const BASE_URL = process.env.E2E_BASE_URL?.trim() || `http://127.0.0.1:${PORT}`;
const DISABLE_WEBSERVER = process.env.E2E_DISABLE_WEBSERVER === '1';
const FILE_MODE = BASE_URL.startsWith('file://');
const WEB_SERVER = DISABLE_WEBSERVER
  ? undefined
  : {
      command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort --mode e2e`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
    };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    ...(FILE_MODE
      ? {
          launchOptions: {
            args: ['--allow-file-access-from-files'],
          },
        }
      : {}),
  },
  ...(WEB_SERVER ? { webServer: WEB_SERVER } : {}),
});
