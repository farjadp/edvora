import { defineConfig } from 'vitest/config'

// Unit tests for pure server helpers (no Next, no database). E2E flows live in /e2e (Playwright).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
