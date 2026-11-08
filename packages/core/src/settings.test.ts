import { describe, expect, it } from 'vitest'
import { ACADEMY_PERMISSIONS, PLATFORM_PERMISSIONS, ROLE_TEMPLATES } from './permissions'
import {
  BUILT_IN_SECTIONS,
  SECTION_PERMISSION,
  SECTION_SCHEMAS,
  academyOverrideAllowed,
  academyPlatformSchema,
  auditSecret,
  canOpenSettings,
  checkUpload,
  decideSecret,
  integrationConfigSchema,
  messageTemplateSchema,
  renderTemplate,
  scrubSecret,
  sniffImage,
  staff2faRequiredBy,
  unknownVariables,
} from './settings'

const perms = (key: string) => [...(ROLE_TEMPLATES.find((r) => r.key === key)?.permissions ?? [])]
const who = (permissions: string[], isPlatformAdmin = false) => ({ isPlatformAdmin, permissions })

describe('settings permissions (default deny)', () => {
  it('every academy section needs a catalog key that an academy can grant', () => {
    for (const s of BUILT_IN_SECTIONS) {
      const p = SECTION_PERMISSION[s]
      if (p === null) continue
      expect(ACADEMY_PERMISSIONS as readonly string[], s).toContain(p)
      expect(PLATFORM_PERMISSIONS as readonly string[]).not.toContain(p)
    }
  })

  it('nobody without permissions opens anything', () => {
    for (const s of BUILT_IN_SECTIONS) expect(canOpenSettings(who([]), SECTION_PERMISSION[s]), s).toBe(false)
  })

  it('platform sections are for platform admins only, even for an academy admin', () => {
    const admin = who(perms('academy-admin'))
    expect(canOpenSettings(admin, SECTION_PERMISSION['platform-providers'])).toBe(false)
    expect(canOpenSettings(admin, SECTION_PERMISSION['platform-academies'])).toBe(false)
    expect(canOpenSettings(who([], true), SECTION_PERMISSION['platform-providers'])).toBe(true)
  })

  it('academy admin opens every academy section, including integrations', () => {
    const admin = who(perms('academy-admin'))
    for (const s of BUILT_IN_SECTIONS) if (SECTION_PERMISSION[s]) expect(canOpenSettings(admin, SECTION_PERMISSION[s]), s).toBe(true)
  })

  it('settings.edit alone does not open integrations (keys) or notifications (templates)', () => {
    const editor = who(['settings.edit'])
    expect(canOpenSettings(editor, SECTION_PERMISSION.identity)).toBe(true)
    expect(canOpenSettings(editor, SECTION_PERMISSION.integrations)).toBe(false)
    expect(canOpenSettings(editor, SECTION_PERMISSION.notifications)).toBe(false)
  })

  it('advisor, finance, support and content editor see no settings section', () => {
    for (const t of ['advisor', 'finance', 'support', 'content-editor', 'instructor', 'reporting']) {
      for (const s of BUILT_IN_SECTIONS) expect(canOpenSettings(who(perms(t)), SECTION_PERMISSION[s]), `${t}/${s}`).toBe(false)
    }
  })

  it('an empty permission string is never satisfied', () => {
    expect(canOpenSettings(who(['settings.edit']), '')).toBe(false)
  })
})

describe('write-only secrets', () => {
  it('empty input keeps, a value sets, remove wins', () => {
    expect(decideSecret({ value: '' })).toEqual({ action: 'keep' })
    expect(decideSecret({ value: '   ' })).toEqual({ action: 'keep' })
    expect(decideSecret({})).toEqual({ action: 'keep' })
    expect(decideSecret({ value: ' abc ' })).toEqual({ action: 'set', value: 'abc' })
    expect(decideSecret({ value: 'abc', clear: true })).toEqual({ action: 'clear' })
  })

  it('the audit log never sees the value', () => {
    expect(auditSecret({ action: 'set', value: 'top-secret' })).toBe('[changed]')
    expect(auditSecret({ action: 'clear' })).toBe('[removed]')
    expect(auditSecret({ action: 'keep' })).toBeNull()
    expect(JSON.stringify(auditSecret(decideSecret({ value: 'top-secret' })))).not.toContain('top-secret')
  })

  it('errors shown to staff never echo the key', () => {
    expect(scrubSecret('401: invalid key ABCD1234EFGH', 'ABCD1234EFGH')).toBe('401: invalid key [secret]')
    expect(scrubSecret('x'.repeat(500), null).length).toBe(200)
  })
})

describe('section validation', () => {
  it('colours must be #RRGGBB', () => {
    const ok = SECTION_SCHEMAS.appearance.safeParse({ primaryColor: '#123456', accentColor: '#abcdef', defaultTheme: 'light', fontDisplay: 'morabba' })
    expect(ok.success).toBe(true)
    for (const bad of ['red', '#123', 'url(x)', '#12345g', '#1234567']) {
      expect(SECTION_SCHEMAS.appearance.safeParse({ primaryColor: bad, accentColor: '#abcdef', defaultTheme: 'light', fontDisplay: 'morabba' }).success, bad).toBe(false)
    }
  })

  it('only self-hosted fonts', () => {
    expect(SECTION_SCHEMAS.appearance.safeParse({ primaryColor: '#123456', accentColor: '#abcdef', defaultTheme: 'light', fontDisplay: 'Roboto' }).success).toBe(false)
  })

  it('social links are https only', () => {
    const parse = (url: string) => SECTION_SCHEMAS.contact.safeParse({ phone: '', email: '', address: '', social: [{ platform: 'instagram', url }] }).success
    expect(parse('https://instagram.com/academy')).toBe(true)
    expect(parse('javascript:alert(1)')).toBe(false)
    expect(parse('http://instagram.com/academy')).toBe(false)
    expect(parse('data:text/html,hi')).toBe(false)
  })

  it('certificate prefix is upper-cased and 2–6 letters', () => {
    expect(SECTION_SCHEMAS.certificates.parse({ certificatePrefix: 'ba', signerName: '', signerTitle: '' }).certificatePrefix).toBe('BA')
    expect(SECTION_SCHEMAS.certificates.safeParse({ certificatePrefix: 'B1', signerName: '', signerTitle: '' }).success).toBe(false)
  })

  it('domains are bare host names', () => {
    const d = (domains: string[]) => academyPlatformSchema.safeParse({ plan: 'starter', domains, maxStudents: '', maxStaff: '', maxCourses: '', storageMb: '', features: [] }).success
    expect(d(['academy.ir', 'www.academy.ir', 'demo.localhost'])).toBe(true)
    expect(d(['https://academy.ir'])).toBe(false)
    expect(d(['academy.ir/path'])).toBe(false)
  })

  it('integration config: SMTP needs host, port and sender; BBB needs https', () => {
    expect(integrationConfigSchema('email', 'smtp')!.safeParse({ host: 'smtp.example.ir', port: '587', fromEmail: 'no-reply@example.ir' }).success).toBe(true)
    expect(integrationConfigSchema('email', 'smtp')!.safeParse({ host: 'smtp example', port: '587', fromEmail: 'x@y.ir' }).success).toBe(false)
    expect(integrationConfigSchema('live', 'bigbluebutton')!.safeParse({ baseUrl: 'http://bbb.example.ir/bigbluebutton/' }).success).toBe(false)
    expect(integrationConfigSchema('sms', 'unknown')).toBeNull()
  })
})

describe('message templates', () => {
  it('renders known variables, blanks missing ones', () => {
    expect(renderTemplate('سلام {{name}}، کد شما {{ code }} است', { name: 'سارا', code: '12345' })).toBe('سلام سارا، کد شما 12345 است')
    expect(renderTemplate('{{name}}{{missing}}', { name: 'a' })).toBe('a')
  })

  it('refuses variables the event does not offer', () => {
    expect(unknownVariables('otp', 'کد {{code}} برای {{amount}}')).toEqual(['amount'])
    const r = messageTemplateSchema.safeParse({ event: 'otp', channel: 'sms', enabled: 'on', subject: '', body: '{{password}}' })
    expect(r.success).toBe(false)
  })

  it('an enabled template needs a body; SMS is length-capped', () => {
    expect(messageTemplateSchema.safeParse({ event: 'otp', channel: 'sms', enabled: 'on', subject: '', body: '' }).success).toBe(false)
    expect(messageTemplateSchema.safeParse({ event: 'otp', channel: 'sms', enabled: 'on', subject: '', body: 'x'.repeat(481) }).success).toBe(false)
    expect(messageTemplateSchema.safeParse({ event: 'otp', channel: 'sms', enabled: '', subject: '', body: '' }).success).toBe(true)
  })
})

describe('uploads', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

  it('sniffs by content, not by name', () => {
    expect(sniffImage(png)).toBe('png')
    expect(sniffImage(svg)).toBe('svg')
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull()
  })

  it('refuses SVG, wrong types and oversize files', () => {
    expect(checkUpload('logo', png)).toMatchObject({ ok: true, kind: 'png', mime: 'image/png' })
    expect(checkUpload('logo', svg).ok).toBe(false)
    expect(checkUpload('favicon', svg).ok).toBe(false)
    expect(checkUpload('logo', new Uint8Array(0)).ok).toBe(false)
    const big = new Uint8Array(1_000_001)
    big.set(png)
    expect(checkUpload('logo', big).ok).toBe(false)
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(checkUpload('signature', jpeg).ok).toBe(false)
  })
})

describe('platform rules', () => {
  it('2FA policy overrides the env flag; env is the fallback', () => {
    expect(staff2faRequiredBy('required', 'false')).toBe(true)
    expect(staff2faRequiredBy('optional', 'true')).toBe(false)
    expect(staff2faRequiredBy('env', 'true')).toBe(true)
    expect(staff2faRequiredBy(null, undefined)).toBe(false)
  })

  it('academy providers are allowed unless the platform switches them off', () => {
    expect(academyOverrideAllowed(null, 'sms')).toBe(true)
    expect(academyOverrideAllowed({ sms: false }, 'sms')).toBe(false)
    expect(academyOverrideAllowed({ sms: false }, 'live')).toBe(true)
  })
})
