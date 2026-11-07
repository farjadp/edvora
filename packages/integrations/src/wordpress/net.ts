/**
 * Network reach rules shared by the REST fallback and the media pull (ADR 011, QA-E032-03): never talk to private,
 * loopback, link-local, CGNAT, multicast or reserved addresses. Server-only (node:dns, node:net).
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'


function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null
}

function privateV4([a, b]: number[]): boolean {
  if (a === undefined || b === undefined) return true
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unparsable addresses (fail closed). */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase()
  const kind = isIP(ip)
  if (kind === 4) {
    const parts = ipv4Parts(ip)
    return parts ? privateV4(parts) : true
  }
  if (kind !== 6) return true
  if (ip === '::' || ip === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1] ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1]
  if (mapped) return isPrivateAddress(mapped)
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(ip)) return true // hex-form mapped v4: refuse
  const first = parseInt(ip.split(':')[0] || '0', 16)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // multicast
  if (ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8:') || ip.startsWith('100::')) return true
  return false
}


export const isLoopbackName = (h: string) => {
  const host = h.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host)
}

export type HostCheck = { ok: true } | { ok: false; reason: 'private_address' | 'loopback' }

/**
 * Checks where a hostname really points before credentials are sent. Literal IPs are checked directly; names are
 * resolved (all addresses). A name that does not resolve is left to fail on connect. Loopback is allowed only with
 * `allowLoopback` (local development).
 */
export async function checkPublicHost(hostname: string, opts: { allowLoopback?: boolean; resolve?: (host: string) => Promise<string[]> } = {}): Promise<HostCheck> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isLoopbackName(host)) return opts.allowLoopback ? { ok: true } : { ok: false, reason: 'loopback' }
  if (isIP(host)) return isPrivateAddress(host) ? { ok: false, reason: 'private_address' } : { ok: true }
  const resolve = opts.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((a) => a.address))
  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch {
    return { ok: true }
  }
  const bad = addresses.filter((a) => isPrivateAddress(a))
  if (!bad.length) return { ok: true }
  return opts.allowLoopback && bad.every((a) => isLoopbackName(a)) ? { ok: true } : { ok: false, reason: 'private_address' }
}
