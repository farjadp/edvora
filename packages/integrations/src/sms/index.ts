import { IntegrationError } from '../errors'
import { createKavenegarProvider } from './kavenegar'
import { createMockSmsProvider } from './mock'
import type { SmsProvider } from './types'

export * from './types'
export { createKavenegarProvider, createMockSmsProvider }

export type SmsConfig = {
  provider: string | undefined
  kavenegarApiKey?: string
  kavenegarSender?: string
}

export function createSmsProvider(cfg: SmsConfig): SmsProvider {
  switch (cfg.provider ?? 'mock') {
    case 'mock':
      return createMockSmsProvider()
    case 'kavenegar':
      return createKavenegarProvider({ apiKey: cfg.kavenegarApiKey ?? '', sender: cfg.kavenegarSender })
    default:
      throw new IntegrationError('sms', `Unknown SMS_PROVIDER: ${cfg.provider}`)
  }
}
