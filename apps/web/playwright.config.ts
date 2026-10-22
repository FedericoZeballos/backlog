import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  // One shared database: run tests one after another.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-AR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run e2e:server -w @backlog/api',
      cwd: '../..',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_APP_URL: `http://localhost:${WEB_PORT}` },
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: 'npx vite',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}`, WEB_PORT: String(WEB_PORT) },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
