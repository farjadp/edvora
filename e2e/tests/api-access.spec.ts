import { expect, test } from '@playwright/test'
import { IBA } from './helpers'

// Anonymous REST reads of private collections must be refused (Payload answers 403).
for (const collection of ['leads', 'orders', 'otp-codes']) {
  test(`anonymous GET /api/${collection} is denied`, async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: IBA })
    const res = await api.get(`/api/${collection}`)
    expect([401, 403]).toContain(res.status())
    const body = (await res.json()) as { docs?: unknown[] }
    expect(body.docs).toBeUndefined()
    await api.dispose()
  })
}
