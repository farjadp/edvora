import { defineConfig } from 'vitest/config'

/** Unit tests for the web app's PURE modules only (no Payload, no Next runtime). Flows are covered by e2e/. */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
