import { expect, test } from '@playwright/test'
import { PLATFORM, createSandbox, disposeSandbox, enterAs, hooksConfigured, newVisitor, tenantOf, type Visitor } from './sandbox-helpers'

/**
 * E-029 × E-045/E-046 (ADR 013): a demo sandbox can never hold real payment secrets or a real AI provider, through
 * any writer; the assistant runs on the mock. (Provider forcing in code is also unit-tested in @edvora/core and was
 * checked against real-provider env with an outbound-socket log; see the E-029 handoff.)
 */
test.skip(!hooksConfigured(), 'SANDBOX_E2E_HOOKS=true and SANDBOX_CRON_SECRET (>= 24 chars) are not configured')

test.describe('sandbox: payment and AI secrets are locked', () => {
  let v: Visitor
  let tenant = 0

  test.beforeAll(async ({ browser }) => {
    v = await newVisitor(browser)
    await createSandbox(v)
    await enterAs(v, 'admin')
    tenant = (await tenantOf(v.context.request)).id
  })
  test.afterAll(async () => {
    await disposeSandbox(v)
  })

  const post = (path: string, data: Record<string, unknown>) => v.context.request.post(`${PLATFORM}${path}`, { data })

  test('payment methods: gateway credentials, live mode, card numbers, USDT wallets and card/USDT/manual methods are refused with 403', async () => {
    const refused: [string, Record<string, unknown>][] = [
      ['gateway credentials', { method: 'zarinpal', title: 'زرین‌پال', enabled: false, mode: 'sandbox', cred_merchantId: '00000000-0000-0000-0000-000000000000' }],
      ['live mode', { method: 'mellat', title: 'ملت', enabled: false, mode: 'live' }],
      ['card-to-card numbers', { method: 'card', title: 'کارت به کارت', enabled: false, cards: [{ number: '6037991234567893', holder: 'نمونه' }] }],
      ['card-to-card enabled', { method: 'card', title: 'کارت به کارت', enabled: true }],
      ['USDT wallet', { method: 'usdt', title: 'تتر', enabled: false, wallets: [{ network: 'trc20', address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' }] }],
      ['manual enabled', { method: 'manual', title: 'ثبت دستی', enabled: true }],
    ]
    for (const [what, data] of refused) {
      const res = await post('/api/payment-methods', { tenant, ...data })
      expect(res.status(), `${what}: ${await res.text()}`).toBe(403)
    }
    // A gateway row in sandbox mode with no secrets is fine (it runs on the mock gateway).
    const ok = await post('/api/payment-methods', { tenant, method: 'zarinpal', title: 'زرین‌پال (آزمایشی)', enabled: true, mode: 'sandbox' })
    expect(ok.status(), await ok.text()).toBe(201)
    const id = ((await ok.json()) as { doc: { id: number } }).doc.id
    // Adding secrets later is refused too.
    const later = await v.context.request.patch(`${PLATFORM}/api/payment-methods/${id}`, { data: { cred_merchantId: 'abc' } })
    expect(later.status()).toBe(403)
  })

  test('AI assistant: only the mock provider; the chat answers from the mock', async () => {
    for (const data of [{ provider: 'openai', model: 'gpt-4o-mini' }, { provider: 'mock', baseUrl: 'https://api.example.com/v1' }]) {
      const res = await post('/api/ai-settings', { tenant, enabled: true, model: 'mock-1', ...data })
      expect(res.status(), JSON.stringify(data)).toBe(403)
    }
    const ok = await post('/api/ai-settings', { tenant, enabled: true, provider: 'mock', model: 'mock-1' })
    expect(ok.status(), await ok.text()).toBe(201)
    const chat = await v.context.request.post(`${PLATFORM}/api/ai/chat`, { headers: { Origin: PLATFORM }, data: { message: 'سلام' } })
    expect(chat.status()).toBe(200)
    const text = (await chat.text())
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { t: string; d?: string })
      .filter((e) => e.t === 'text')
      .map((e) => e.d ?? '')
      .join('')
    expect(text).toContain('ارائه‌دهندهٔ آزمایشی')
  })
})
