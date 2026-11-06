import type { SmsProvider } from './types'

export type MockSmsMessage = { to: string; text: string; at: Date }

/** Logs messages instead of sending them. `outbox` lets tests and dev tools read them. */
export function createMockSmsProvider(opts: { log?: (line: string) => void } = {}): SmsProvider & {
  outbox: MockSmsMessage[]
} {
  const log = opts.log ?? ((line: string) => console.info(line))
  const outbox: MockSmsMessage[] = []
  const push = (to: string, text: string) => {
    outbox.push({ to, text, at: new Date() })
    if (outbox.length > 100) outbox.shift()
    log(`[sms:mock] → ${to}: ${text}`)
    return { ok: true as const, messageId: `mock-${outbox.length}` }
  }
  return {
    name: 'mock',
    outbox,
    async sendTemplate({ to, template, tokens }) {
      return push(to, `{${template}} ${tokens.join(' | ')}`)
    },
    async send({ to, text }) {
      return push(to, text)
    },
  }
}
