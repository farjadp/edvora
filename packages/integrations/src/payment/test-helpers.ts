import { vi } from 'vitest'

/** Test-only: a fetch stub that answers each call with the next body (string bodies are sent as-is). */
export function stubFetch(...bodies: Array<unknown>) {
  const fn = vi.fn<typeof fetch>()
  for (const b of bodies) {
    fn.mockResolvedValueOnce(b instanceof Response ? b : new Response(typeof b === 'string' ? b : JSON.stringify(b)))
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

export function call(fn: ReturnType<typeof stubFetch>, i: number): { url: string; init: RequestInit } {
  const c = fn.mock.calls[i]
  if (!c) throw new Error(`fetch call ${i} not made`)
  return { url: String(c[0]), init: c[1] ?? {} }
}

export const jsonBody = (fn: ReturnType<typeof stubFetch>, i: number): Record<string, unknown> =>
  JSON.parse(String(call(fn, i).init.body)) as Record<string, unknown>

export const formBody = (fn: ReturnType<typeof stubFetch>, i: number): URLSearchParams => {
  const b = call(fn, i).init.body
  return b instanceof URLSearchParams ? b : new URLSearchParams(String(b))
}

export const baseInput = {
  amount: 10_000,
  description: 'Brand MBA',
  callbackUrl: 'https://iba.example/api/payments/callback',
  mobile: '09121234567',
  orderId: 'ord-1',
  attemptId: '42',
} as const
