import { describe, expect, it } from 'vitest'
import { openSettingSecret, sealSettingSecret, settingsServerKey } from './settingsSecrets'

const KEY = 'a-test-server-key-of-enough-length'

describe('integration secrets at rest', () => {
  it('round-trips and never stores the plain value', () => {
    const sealed = sealSettingSecret('kavenegar-api-key-123', { tenantId: 7, kind: 'sms' }, KEY)
    expect(sealed).not.toContain('kavenegar-api-key-123')
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(openSettingSecret(sealed, { tenantId: 7, kind: 'sms' }, KEY)).toBe('kavenegar-api-key-123')
  })

  it('each seal is different (random IV)', () => {
    const b = { tenantId: 1, kind: 'sms' }
    expect(sealSettingSecret('same', b, KEY)).not.toBe(sealSettingSecret('same', b, KEY))
  })

  it('a value copied to another academy or kind does not open', () => {
    const sealed = sealSettingSecret('secret', { tenantId: 1, kind: 'sms' }, KEY)
    expect(openSettingSecret(sealed, { tenantId: 2, kind: 'sms' }, KEY)).toBeNull()
    expect(openSettingSecret(sealed, { tenantId: 1, kind: 'email' }, KEY)).toBeNull()
  })

  it('a rotated key or tampered value does not open', () => {
    const b = { tenantId: 1, kind: 'live' }
    const sealed = sealSettingSecret('secret', b, KEY)
    expect(openSettingSecret(sealed, b, `${KEY}-rotated`)).toBeNull()
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(openSettingSecret(parts.join('.'), b, KEY)).toBeNull()
    expect(openSettingSecret('', b, KEY)).toBeNull()
    expect(openSettingSecret(null, b, KEY)).toBeNull()
  })

  it('refuses to seal nothing, and needs a real server key', () => {
    expect(() => sealSettingSecret('', { tenantId: 1, kind: 'sms' }, KEY)).toThrow()
    expect(() => settingsServerKey({})).toThrow()
    expect(() => settingsServerKey({ PAYLOAD_SECRET: 'short' })).toThrow()
    expect(settingsServerKey({ PAYLOAD_SECRET: KEY })).toBe(KEY)
    expect(settingsServerKey({ SETTINGS_SECRETS_KEY: `${KEY}-own`, PAYLOAD_SECRET: KEY })).toBe(`${KEY}-own`)
  })
})
