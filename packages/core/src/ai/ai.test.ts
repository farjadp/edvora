import { describe, expect, it } from 'vitest'
import type { AccessContext } from '../access'
import { ACADEMY_PERMISSIONS } from '../permissions'
import {
  ACTIONS,
  DEFAULT_PRIVACY,
  FOUR_EYES_APPROVALS,
  LOCAL_EMBEDDING_MODEL,
  PROPOSAL_TTL_MS,
  budgetDecision,
  chunkText,
  citationsIn,
  confirmDecision,
  cosine,
  isValidNationalCode,
  keyHint,
  localEmbedding,
  openAiKey,
  parseProposal,
  pickSources,
  privacyPolicy,
  rateDecision,
  redactRecord,
  redactText,
  rejectDecision,
  sealAiKey,
  systemPrompt,
  toolsFor,
  usageCost,
  type ProposalState,
  type Source,
} from './index'

const ctx = (permissions: string[], over: Partial<AccessContext> = {}): AccessContext => ({
  userId: 7,
  isPlatformAdmin: false,
  memberships: [{ tenantId: 1, status: 'active', permissions }],
  ...over,
})

describe('redaction', () => {
  it('validates national codes by checksum', () => {
    expect(isValidNationalCode('0499370899')).toBe(true)
    expect(isValidNationalCode('0499370898')).toBe(false)
    expect(isValidNationalCode('1111111111')).toBe(false)
  })

  it('redacts phones, emails and national codes by default and keeps names', () => {
    const out = redactText('علی رضایی، موبایل ۰۹۱۲۳۴۵۶۷۸۹ و +98 912 345 6789، ایمیل ali@example.com، کد ملی 0499370899')
    expect(out).toContain('علی رضایی')
    expect(out).not.toMatch(/0912|۰۹۱۲|912 345/)
    expect(out).not.toContain('ali@example.com')
    expect(out).not.toContain('0499370899')
    expect(out.match(/\[تلفن\]/g)).toHaveLength(2)
    expect(out).toContain('[ایمیل]')
    expect(out).toContain('[کد ملی]')
  })

  it('leaves ordinary numbers alone (prices, years, invalid 10-digit numbers)', () => {
    const text = 'قیمت 450000000 ریال، سال 1405، شماره سفارش 1234567890'
    expect(redactText(text)).toBe(text)
  })

  it('always redacts card numbers and IBANs, whatever the policy', () => {
    const open = { names: true, nationalCodes: true, phones: true, emails: true }
    const out = redactText('کارت 6037-9975-9950-9503 و شبا IR062960000000100324200001', open)
    expect(out).toContain('[کارت بانکی]')
    expect(out).toContain('[شبا]')
  })

  it('follows the policy switches', () => {
    const open = privacyPolicy({ phones: true, emails: true })
    expect(redactText('09123456789 a@b.io', open)).toBe('09123456789 a@b.io')
    expect(privacyPolicy(null)).toEqual(DEFAULT_PRIVACY)
  })

  it('redacts structured records by field and drops secrets', () => {
    const rec = { name: 'سارا', phone: '09121112233', email: 'x@y.com', nationalCode: '0499370899', password: 'p', nested: { note: 'call 09351234567' } }
    expect(redactRecord(rec)).toEqual({ name: 'سارا', phone: '[تلفن]', email: '[ایمیل]', nationalCode: '[کد ملی]', nested: { note: 'call [تلفن]' } })
    expect((redactRecord(rec, { ...DEFAULT_PRIVACY, names: false }) as { name: string }).name).toBe('[نام]')
  })
})

describe('tools and permissions', () => {
  it('offers nothing without ai.use', () => {
    expect(toolsFor(ctx(['courses.view', 'coupons.manage']), 1)).toEqual([])
  })

  it('offers read tools by permission and write tools only with the action permission', () => {
    const names = (c: AccessContext) => toolsFor(c, 1).map((t) => t.name)
    const advisor = names(ctx(['ai.use', 'leads.view.own', 'courses.view']))
    expect(advisor).toEqual(expect.arrayContaining(['search_leads', 'search_courses', 'search_knowledge', 'propose_lead_followup', 'propose_memory']))
    expect(advisor).not.toContain('search_orders')
    expect(advisor).not.toContain('propose_coupon')
    expect(names(ctx(['ai.use', 'coupons.manage']))).toContain('propose_coupon')
    // Other academy: nothing.
    expect(toolsFor(ctx(['ai.use', 'coupons.manage']), 2)).toEqual([])
  })

  it('gives every tool a JSON schema object', () => {
    for (const t of toolsFor(ctx(['ai.use', ...ACADEMY_PERMISSIONS]), 1)) {
      expect(t.parameters.type).toBe('object')
    }
  })

  it('never exposes a four-eyes approval as an action', () => {
    for (const a of Object.values(ACTIONS)) expect(FOUR_EYES_APPROVALS).not.toContain(a.permission)
    expect(parseProposal('approve_payment', {})).toMatchObject({ ok: false })
  })

  it('validates proposals', () => {
    expect(parseProposal('propose_coupon', { code: 'ALUMNI10', kind: 'percent', value: 10 })).toMatchObject({ ok: true, kind: 'coupon.create' })
    expect(parseProposal('propose_coupon', { code: 'X', kind: 'percent', value: 10 })).toMatchObject({ ok: false })
    expect(parseProposal('propose_coupon', { code: 'BIG', kind: 'percent', value: 150 })).toMatchObject({ ok: false })
    expect(parseProposal('propose_coupon', { code: 'F', kind: 'fixed', value: 1.5 })).toMatchObject({ ok: false })
    expect(parseProposal('propose_course_update', { courseId: 3, changes: {} })).toMatchObject({ ok: false })
    expect(parseProposal('propose_course_update', { courseId: 3, changes: { title: 'دورهٔ تازه' } })).toMatchObject({ ok: true })
  })
})

describe('confirmation flow', () => {
  const now = new Date('2026-11-08T10:00:00Z')
  const pending: ProposalState = { tenantId: 1, proposedBy: 7, kind: 'coupon.create', status: 'pending', expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS) }
  const manager = ctx(['ai.use', 'coupons.manage'])

  it('lets the person who asked confirm with the permission', () => {
    expect(confirmDecision(pending, { ctx: manager, tenantId: 1 }, now)).toEqual({ ok: true })
  })

  it('refuses another person, another academy, lost permission, expired and already-done proposals', () => {
    expect(confirmDecision(pending, { ctx: { ...manager, userId: 8 }, tenantId: 1 }, now)).toEqual({ ok: false, reason: 'not-yours' })
    expect(confirmDecision(pending, { ctx: manager, tenantId: 2 }, now)).toEqual({ ok: false, reason: 'other-academy' })
    expect(confirmDecision(pending, { ctx: ctx(['ai.use']), tenantId: 1 }, now)).toEqual({ ok: false, reason: 'no-permission' })
    expect(confirmDecision(pending, { ctx: ctx(['coupons.manage']), tenantId: 1 }, now)).toEqual({ ok: false, reason: 'no-ai-access' })
    expect(confirmDecision({ ...pending, expiresAt: now }, { ctx: manager, tenantId: 1 }, now)).toEqual({ ok: false, reason: 'expired' })
    expect(confirmDecision({ ...pending, status: 'executed' }, { ctx: manager, tenantId: 1 }, now)).toEqual({ ok: false, reason: 'already-executed' })
    expect(confirmDecision({ ...pending, kind: 'refund.approve' }, { ctx: manager, tenantId: 1 }, now)).toEqual({ ok: false, reason: 'unknown-action' })
  })

  it('refuses a suspended or expired membership', () => {
    const suspended = ctx(['ai.use', 'coupons.manage'], { memberships: [{ tenantId: 1, status: 'suspended', permissions: ['ai.use', 'coupons.manage'] }] })
    expect(confirmDecision(pending, { ctx: suspended, tenantId: 1 }, now)).toEqual({ ok: false, reason: 'no-ai-access' })
  })

  it('lets only the owner reject a pending proposal', () => {
    expect(rejectDecision(pending, { ctx: manager, tenantId: 1 })).toEqual({ ok: true })
    expect(rejectDecision(pending, { ctx: { ...manager, userId: 9 }, tenantId: 1 })).toMatchObject({ ok: false })
  })
})

describe('limits', () => {
  it('rate-limits per minute and per day', () => {
    expect(rateDecision({ sentLastMinute: 0, sentToday: 0 })).toEqual({ ok: true })
    expect(rateDecision({ sentLastMinute: 20, sentToday: 20 })).toMatchObject({ ok: false, reason: 'per-minute' })
    expect(rateDecision({ sentLastMinute: 0, sentToday: 300 })).toMatchObject({ ok: false, reason: 'per-day' })
  })

  it('computes cost in integer rials and checks the monthly budget', () => {
    const s = { inputPricePerMillionRial: 3_000_000, outputPricePerMillionRial: 12_000_000 }
    expect(usageCost({ inputTokens: 1000, outputTokens: 500 }, s)).toBe(9000)
    expect(Number.isInteger(usageCost({ inputTokens: 1, outputTokens: 1 }, s))).toBe(true)
    expect(budgetDecision({ inputTokens: 900, outputTokens: 200 }, { monthlyTokenLimit: 1000 })).toMatchObject({ ok: false, reason: 'tokens' })
    expect(budgetDecision({ inputTokens: 1_000_000, outputTokens: 0 }, { ...s, monthlyCostLimitRial: 2_000_000 })).toMatchObject({ ok: false, reason: 'cost' })
    expect(budgetDecision({ inputTokens: 10, outputTokens: 10 }, {})).toMatchObject({ ok: true })
  })
})

describe('retrieval', () => {
  it('chunks long text with overlap and keeps short text whole', () => {
    expect(chunkText('سلام')).toEqual([{ ordinal: 0, content: 'سلام' }])
    const long = Array.from({ length: 40 }, (_, i) => `بند ${i}: ${'متن آزمایشی '.repeat(12)}`).join('\n\n')
    const chunks = chunkText(long, { size: 500, overlap: 80 })
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(500 + 100)
  })

  it('local embedding finds the related passage, across letter and digit variants', () => {
    expect(LOCAL_EMBEDDING_MODEL).toBe('local-hash-v2-1024')
    const q = localEmbedding('سیاست بازپرداخت شهریه چیست؟')
    const refund = localEmbedding('سياست بازپرداخت: شهريه تا ۱۴ روز پس از ثبت‌نام بازپرداخت می‌شود.')
    const other = localEmbedding('کلاس‌های زنده روزهای دوشنبه برگزار می‌شوند.')
    expect(cosine(q, refund)).toBeGreaterThan(cosine(q, other))
    expect(cosine([1, 0], [1])).toBe(0)
  })

  it('numbers sources and extracts the citations used', () => {
    const src: Source[] = [
      { kind: 'document', id: 1, title: 'آیین‌نامه', content: 'a', score: 0.9 },
      { kind: 'memory', id: 2, title: 'یادداشت', content: 'b', score: 0.5 },
      { kind: 'chat', id: 3, title: 'قبلی', content: 'c', score: 0.05 },
    ]
    const picked = pickSources(src)
    expect(picked.map((s) => s.id)).toEqual([1, 2])
    expect(citationsIn('طبق آیین‌نامه [۲] و [1، 2] و [9]', picked).map((c) => c.n)).toEqual([2, 1])
  })

  it('builds a Persian system prompt with sources and the confirmation rule', () => {
    const p = systemPrompt({ academyName: 'آکادمی آزمایشی', today: '۱۷ آبان ۱۴۰۵', memories: ['بازپرداخت تا ۱۴ روز'], sources: '[1] (سند: x)\nمتن', canPropose: true, page: { path: '/staff/leads' } })
    expect(p).toContain('آکادمی آزمایشی')
    expect(p).toContain('propose_')
    expect(p).toContain('[1]')
    expect(p).toContain('/staff/leads')
  })
})

describe('sealed API keys', () => {
  it('round-trips, refuses the wrong secret and tampering, and only hints at the key', () => {
    const sealed = sealAiKey('sk-test-1234567890abcd', 'server-secret-1')
    expect(sealed).not.toContain('sk-test')
    expect(openAiKey(sealed, 'server-secret-1')).toBe('sk-test-1234567890abcd')
    expect(openAiKey(sealed, 'other-secret-22')).toBeNull()
    expect(openAiKey(`${sealed.slice(0, -2)}xx`, 'server-secret-1')).toBeNull()
    expect(openAiKey(null, 'server-secret-1')).toBeNull()
    expect(keyHint('sk-test-1234567890abcd')).toBe('••••abcd')
  })
})
