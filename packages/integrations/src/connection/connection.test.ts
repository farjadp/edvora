import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { checkBigBlueButton, checkConnection, checkKavenegar, checkSmtp, hostAllowed, isPrivateAddress } from './index'

const fetchReturning = (body: string, seen: string[] = []) =>
  (async (url: string | URL | Request) => {
    seen.push(String(url))
    return new Response(body, { status: 200 })
  }) as typeof fetch

/** A fake SMTP server: answers each written command with the next scripted reply. */
function fakeSmtp(replies: string[]): () => Socket {
  return () => {
    const s = new EventEmitter() as EventEmitter & { write: (d: string) => boolean; end: () => void; destroy: () => void; setTimeout: () => void }
    const queue = [...replies]
    s.write = () => {
      const r = queue.shift()
      if (r) setTimeout(() => s.emit('data', Buffer.from(r)), 0)
      return true
    }
    s.end = () => undefined
    s.destroy = () => undefined
    s.setTimeout = () => undefined
    setTimeout(() => s.emit('data', Buffer.from(queue.shift() ?? '')), 0)
    return s as unknown as Socket
  }
}

const publicDns = { resolve: async () => ['185.143.233.1'] }

describe('connection checks', () => {
  it('mocks always pass and need nothing', async () => {
    for (const kind of ['sms', 'email', 'live'] as const) expect((await checkConnection({ kind, provider: 'mock' } as never)).ok).toBe(true)
  })

  it('kavenegar: 200 = ok with credit; 401 = key refused; the key never appears in the message', async () => {
    const seen: string[] = []
    const good = await checkKavenegar('KEY-123', { fetch: fetchReturning('{"return":{"status":200,"message":"ok"},"entries":{"remaincredit":5000}}', seen) })
    expect(good.ok).toBe(true)
    expect(seen[0]).toContain('/account/info.json')
    const bad = await checkKavenegar('KEY-123', { fetch: fetchReturning('{"return":{"status":401,"message":"bad"}}') })
    expect(bad).toEqual({ ok: false, message: 'کلید API پذیرفته نشد' })
    expect(bad.message).not.toContain('KEY-123')
    expect((await checkKavenegar('', {})).ok).toBe(false)
  })

  it('bigbluebutton: SUCCESS = ok, checksumError = wrong secret', async () => {
    const opts = { baseUrl: 'https://bbb.example.ir/bigbluebutton/', secret: 's3cret' }
    const seen: string[] = []
    expect((await checkBigBlueButton(opts, { ...publicDns, fetch: fetchReturning('<response><returncode>SUCCESS</returncode></response>', seen) })).ok).toBe(true)
    expect(seen[0]).toMatch(/\/api\/getMeetings\?checksum=[0-9a-f]{64}$/)
    expect(seen[0]).not.toContain('s3cret')
    const bad = await checkBigBlueButton(opts, { ...publicDns, fetch: fetchReturning('<response><returncode>FAILED</returncode><messageKey>checksumError</messageKey></response>') })
    expect(bad.ok).toBe(false)
  })

  it('smtp: 220 greeting + 250 EHLO = ok; anything else fails', async () => {
    const good = await checkSmtp({ host: 'smtp.example.ir', port: 587, secure: false }, { ...publicDns, socket: fakeSmtp(['220 mail ready\r\n', '250-mail\r\n250 STARTTLS\r\n']) })
    expect(good).toEqual({ ok: true, message: 'سرور SMTP پاسخ داد (STARTTLS پشتیبانی می‌شود)' })
    const busy = await checkSmtp({ host: 'smtp.example.ir', port: 587, secure: false }, { ...publicDns, socket: fakeSmtp(['421 busy\r\n']) })
    expect(busy.ok).toBe(false)
  })

  it('SSRF guard: internal addresses and localhost are refused unless allowed', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true)
    expect(isPrivateAddress('185.143.233.1')).toBe(false)
    expect(await hostAllowed('localhost', {})).toBe(false)
    expect(await hostAllowed('mail.internal', { resolve: async () => ['10.1.2.3'] })).toBe(false)
    expect(await hostAllowed('mail.example.ir', publicDns)).toBe(true)
    expect(await hostAllowed('localhost', { allowPrivateHosts: true })).toBe(true)
    const r = await checkSmtp({ host: '127.0.0.1', port: 25, secure: false }, {})
    expect(r.ok).toBe(false)
  })
})
