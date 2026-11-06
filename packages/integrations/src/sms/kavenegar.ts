import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { SmsProvider } from './types'

/** Kavenegar REST API. Docs: https://kavenegar.com/rest.html */
const Response = z.object({
  return: z.object({ status: z.number(), message: z.string() }),
  entries: z.union([z.array(z.object({ messageid: z.union([z.number(), z.string()]) })), z.null()]).optional(),
})

export function createKavenegarProvider(opts: { apiKey: string; sender?: string }): SmsProvider {
  if (!opts.apiKey) throw new IntegrationError('kavenegar', 'KAVENEGAR_API_KEY is missing')
  const base = `https://api.kavenegar.com/v1/${encodeURIComponent(opts.apiKey)}`

  const call = async (path: string, params: Record<string, string>) => {
    const raw = await fetchJson('kavenegar', `${base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    const parsed = Response.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Unexpected response' }
    if (parsed.data.return.status !== 200) return { ok: false as const, error: parsed.data.return.message }
    return { ok: true as const, messageId: String(parsed.data.entries?.[0]?.messageid ?? '') }
  }

  return {
    name: 'kavenegar',
    sendTemplate({ to, template, tokens }) {
      const params: Record<string, string> = { receptor: to, template }
      const keys = ['token', 'token2', 'token3'] as const
      tokens.slice(0, 3).forEach((t, i) => {
        params[keys[i]!] = t
      })
      return call('verify/lookup.json', params)
    },
    send({ to, text }) {
      const params: Record<string, string> = { receptor: to, message: text }
      if (opts.sender) params.sender = opts.sender
      return call('sms/send.json', params)
    },
  }
}
