import { lookup } from 'node:dns/promises'
import { connect as netConnect, isIP, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { bbbChecksum, normalizeApiBase, type BbbChecksumAlgorithm } from '../live-class/bigbluebutton'

/**
 * "Test connection" for the settings hub (E-047, ADR 019 §5). Each check proves the provider answers and accepts
 * the credentials, without sending a message or creating anything. Results carry a short Persian message and never
 * the secret (callers also scrub). Every check has a mock that always passes, so CI and the demo need no network.
 */
export type ConnectionResult = { ok: boolean; message: string }

export type ConnectionDeps = {
  fetch?: typeof fetch
  /** Opens a TCP (or TLS) socket; replaced in tests. */
  socket?: (opts: { host: string; port: number; secure: boolean; timeoutMs: number }) => Socket
  timeoutMs?: number
  /** Allow loopback / private addresses (local dev and tests only). Off: a staff-typed host cannot reach the internal network. */
  allowPrivateHosts?: boolean
  /** DNS resolver; replaced in tests. */
  resolve?: (host: string) => Promise<string[]>
}

/** Loopback, private, link-local, CGNAT and unspecified ranges (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7))
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80')
  }
  return true
}

/** SSRF guard: every address the name resolves to must be public (unless private hosts are allowed). */
export async function hostAllowed(host: string, deps: ConnectionDeps): Promise<boolean> {
  if (deps.allowPrivateHosts) return true
  const h = host.replace(/^\[|\]$/g, '')
  if (/(^|\.)localhost$/i.test(h)) return false
  try {
    const addrs = isIP(h) ? [h] : await (deps.resolve ?? (async (n: string) => (await lookup(n, { all: true })).map((a) => a.address)))(h)
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a))
  } catch {
    return false
  }
}

const BLOCKED = 'این نشانی به شبکهٔ داخلی اشاره می‌کند و پذیرفته نیست'

const ok = (message: string): ConnectionResult => ({ ok: true, message })
const fail = (message: string): ConnectionResult => ({ ok: false, message })

async function getText(deps: ConnectionDeps, url: string): Promise<{ status: number; text: string }> {
  const f = deps.fetch ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 10_000)
  try {
    const res = await f(url, { signal: ctrl.signal, redirect: 'error' })
    return { status: res.status, text: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

const netError = (err: unknown) => (err instanceof Error && err.name === 'AbortError' ? 'پاسخی در زمان مقرر نیامد' : 'اتصال برقرار نشد')

/** Kavenegar `account/info`: proves the key is valid; returns the remaining credit when given. */
export async function checkKavenegar(apiKey: string, deps: ConnectionDeps = {}): Promise<ConnectionResult> {
  if (!apiKey) return fail('کلید API وارد نشده است')
  try {
    const { text } = await getText(deps, `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/account/info.json`)
    const body = JSON.parse(text) as { return?: { status?: number; message?: string }; entries?: { remaincredit?: number } }
    if (body.return?.status === 200) {
      const credit = body.entries?.remaincredit
      return ok(typeof credit === 'number' ? `اتصال برقرار است. اعتبار باقی‌مانده: ${credit.toLocaleString('fa-IR')} ریال` : 'اتصال برقرار است')
    }
    return fail(body.return?.status === 401 || body.return?.status === 403 ? 'کلید API پذیرفته نشد' : `پاسخ کاوه‌نگار: ${body.return?.status ?? 'نامشخص'}`)
  } catch (err) {
    return fail(err instanceof SyntaxError ? 'پاسخ کاوه‌نگار قابل خواندن نبود' : netError(err))
  }
}

/** BigBlueButton `getMeetings` with a signed checksum: SUCCESS proves URL and shared secret. */
export async function checkBigBlueButton(opts: { baseUrl: string; secret: string; checksum?: BbbChecksumAlgorithm }, deps: ConnectionDeps = {}): Promise<ConnectionResult> {
  if (!opts.secret) return fail('رمز مشترک وارد نشده است')
  let api: string
  try {
    api = normalizeApiBase(opts.baseUrl)
  } catch {
    return fail('نشانی سرور درست نیست')
  }
  if (!(await hostAllowed(new URL(api).hostname, deps))) return fail(BLOCKED)
  try {
    const sum = bbbChecksum('getMeetings', '', opts.secret, opts.checksum ?? 'sha256')
    const { text } = await getText(deps, `${api}/getMeetings?checksum=${sum}`)
    if (/<returncode>\s*SUCCESS\s*<\/returncode>/i.test(text)) return ok('اتصال برقرار است')
    if (/checksumError/i.test(text)) return fail('رمز مشترک یا الگوریتم checksum نادرست است')
    return fail('سرور پاسخ BigBlueButton نداد')
  } catch (err) {
    return fail(netError(err))
  }
}

function defaultSocket(opts: { host: string; port: number; secure: boolean; timeoutMs: number }): Socket {
  const s = opts.secure ? tlsConnect({ host: opts.host, port: opts.port, servername: opts.host }) : netConnect({ host: opts.host, port: opts.port })
  s.setTimeout(opts.timeoutMs)
  return s
}

/**
 * SMTP: greeting (220) and EHLO (250). No login and no mail: enough to prove host, port and TLS mode; credentials
 * are checked on the first real send (an AUTH probe would need a full SASL/STARTTLS client).
 */
export async function checkSmtp(opts: { host: string; port: number; secure: boolean }, deps: ConnectionDeps = {}): Promise<ConnectionResult> {
  const timeoutMs = deps.timeoutMs ?? 10_000
  if (!(await hostAllowed(opts.host, deps))) return fail(BLOCKED)
  return new Promise<ConnectionResult>((resolve) => {
    let buf = ''
    let stage: 'greeting' | 'ehlo' | 'done' = 'greeting'
    let settled = false
    let socket: Socket
    const finish = (r: ConnectionResult) => {
      if (settled) return
      settled = true
      stage = 'done'
      try {
        socket.end('QUIT\r\n')
        socket.destroy()
      } catch {
        /* closing a dead socket */
      }
      resolve(r)
    }
    try {
      socket = (deps.socket ?? defaultSocket)({ host: opts.host, port: opts.port, secure: opts.secure, timeoutMs })
    } catch {
      resolve(fail('اتصال برقرار نشد'))
      return
    }
    socket.on('timeout', () => finish(fail('پاسخی در زمان مقرر نیامد')))
    socket.on('error', () => finish(fail('اتصال برقرار نشد')))
    socket.on('close', () => finish(fail('سرور اتصال را بست')))
    socket.on('data', (chunk: Buffer | string) => {
      buf += chunk.toString()
      // A reply is complete when its last line has a space after the code ("250 ok", not "250-ok").
      const lines = buf.split('\r\n').filter(Boolean)
      const last = lines[lines.length - 1] ?? ''
      if (!/^\d{3} /.test(last) || !buf.endsWith('\r\n')) return
      const code = Number(last.slice(0, 3))
      buf = ''
      if (stage === 'greeting') {
        if (code !== 220) return finish(fail(`سرور SMTP آماده نیست (${code})`))
        stage = 'ehlo'
        socket.write('EHLO edvora.local\r\n')
      } else if (stage === 'ehlo') {
        if (code !== 250) return finish(fail(`سرور SMTP پاسخ EHLO نداد (${code})`))
        const tls = opts.secure ? 'با TLS' : lines.some((l) => /STARTTLS/i.test(l)) ? 'STARTTLS پشتیبانی می‌شود' : 'بدون رمزنگاری'
        finish(ok(`سرور SMTP پاسخ داد (${tls})`))
      }
    })
  })
}

export type ConnectionCheck =
  | { kind: 'sms'; provider: 'mock' }
  | { kind: 'sms'; provider: 'kavenegar'; secret: string }
  | { kind: 'email'; provider: 'mock' }
  | { kind: 'email'; provider: 'smtp'; host: string; port: number; secure: boolean }
  | { kind: 'live'; provider: 'mock' }
  | { kind: 'live'; provider: 'bigbluebutton'; baseUrl: string; secret: string; checksum?: BbbChecksumAlgorithm }

export async function checkConnection(input: ConnectionCheck, deps: ConnectionDeps = {}): Promise<ConnectionResult> {
  switch (input.provider) {
    case 'mock':
      return ok('سرویس آزمایشی: اتصال شبیه‌سازی شد')
    case 'kavenegar':
      return checkKavenegar(input.secret, deps)
    case 'smtp':
      return checkSmtp(input, deps)
    case 'bigbluebutton':
      return checkBigBlueButton(input, deps)
  }
}
