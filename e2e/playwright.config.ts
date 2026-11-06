import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests for Edvora (board task E-010).
 *
 * Needs Postgres up and a fresh seed: `pnpm db:up && pnpm seed`.
 * The app must run with the mock providers (PAYMENT_PROVIDER=mock, SMS_PROVIDER=mock).
 *
 * E2E_PORT   — port of the web app (default 3000). Tenants are resolved from the Host header,
 *              so iba = http://localhost:PORT and demo = http://demo.localhost:PORT.
 * E2E_NO_SERVER=1 — don't start a server; use one that's already running on E2E_PORT.
 */
const port = Number(process.env.E2E_PORT ?? 3000)
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  outputDir: '../test-results',
  // Next dev compiles each route on first hit; give cold pages room.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'fa-IR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium resolves *.localhost to loopback by itself; this makes it explicit on every runner.
        launchOptions: { args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'] },
      },
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: `pnpm --filter @edvora/web dev --port ${port}`,
        cwd: '..',
        url: `http://localhost:${port}/`,
        reuseExistingServer: !isCI,
        timeout: 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
