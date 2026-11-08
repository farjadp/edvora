import { afterEach, describe, expect, it } from 'vitest'
import { openCredentials, sealCredentials } from './paymentSecrets'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('gateway credentials at rest (ADR 017 §4)', () => {
  it('seals and opens, never storing the plain value', () => {
    process.env.PAYMENT_SECRETS_KEY = 'test-key-123456'
    const sealed = sealCredentials({ merchantId: 'M-123', password: 'p@ss' })
    expect(sealed).not.toContain('M-123')
    expect(sealed).not.toContain('p@ss')
    expect(openCredentials(sealed)).toEqual({ merchantId: 'M-123', password: 'p@ss' })
  })
  it('does not open with another key or a tampered value', () => {
    process.env.PAYMENT_SECRETS_KEY = 'test-key-123456'
    const sealed = sealCredentials({ apiKey: 'k' })
    process.env.PAYMENT_SECRETS_KEY = 'other-key-654321'
    expect(openCredentials(sealed)).toBeNull()
    process.env.PAYMENT_SECRETS_KEY = 'test-key-123456'
    expect(openCredentials(`${sealed.slice(0, -2)}xx`)).toBeNull()
    expect(openCredentials(null)).toBeNull()
  })
  it('falls back to PAYLOAD_SECRET and drops empty keys', () => {
    delete process.env.PAYMENT_SECRETS_KEY
    process.env.PAYLOAD_SECRET = 'payload-secret-abc'
    expect(openCredentials(sealCredentials({ terminalId: '1', username: '' }))).toEqual({ terminalId: '1' })
  })
})
