import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canonicalRequest, memoryNonceStore, sha256Hex, signBundle, signRequest, verifyBundle, verifyRequest } from './signature'

type Vector = {
  secret: string
  requests: { method: string; pathWithQuery: string; timestamp: string; nonce: string; body: string; bodySha256: string; canonical: string; signature: string }[]
  bundle: { signedContent: string; signature: string }
}
const vector = JSON.parse(readFileSync(new URL('./fixtures/signature-vector.json', import.meta.url), 'utf8')) as Vector

const T = 1762423200
const base = { secret: vector.secret, connectionId: 'cnx_1', method: 'POST', pathWithQuery: '/api/import/push/records?kind=wp.user&seq=1', body: '{"a":1}\n' }

describe('request signature (FORMAT.md §5)', () => {
  it('matches the shared test vectors', () => {
    for (const v of vector.requests) {
      expect(sha256Hex(v.body)).toBe(v.bodySha256)
      expect(canonicalRequest(v)).toBe(v.canonical)
      expect(signRequest({ ...v, secret: vector.secret, connectionId: 'x', timestamp: Number(v.timestamp) })['X-Edvora-Signature']).toBe(v.signature)
    }
    expect(vector.requests[0]?.signature).toBe('8655c65e291469d1e2898516e8f721ac08c3d20e8aa8b7133f208dbfaeb8938b')
  })

  it('verifies a signed request once, then refuses the replay', async () => {
    const headers = signRequest({ ...base, timestamp: T })
    const seenNonce = memoryNonceStore(600, () => T)
    const ok = await verifyRequest({ ...base, headers, seenNonce, nowSeconds: T + 10, expectedConnectionId: 'cnx_1' })
    expect(ok).toMatchObject({ ok: true, connectionId: 'cnx_1' })
    expect(await verifyRequest({ ...base, headers, seenNonce, nowSeconds: T + 11 })).toEqual({ ok: false, code: 'replay' })
  })

  it('refuses tampering, clock skew and bad headers', async () => {
    const headers = signRequest({ ...base, timestamp: T })
    const fresh = () => memoryNonceStore(600, () => T)
    const v = (over: Partial<Parameters<typeof verifyRequest>[0]>) => verifyRequest({ ...base, headers, seenNonce: fresh(), nowSeconds: T, ...over })
    expect(await v({ body: '{"a":2}\n' })).toEqual({ ok: false, code: 'bad_signature' })
    expect(await v({ pathWithQuery: '/api/import/push/records?kind=wp.user&seq=2' })).toEqual({ ok: false, code: 'bad_signature' })
    expect(await v({ method: 'PUT' })).toEqual({ ok: false, code: 'bad_signature' })
    expect(await v({ secret: 'other' })).toEqual({ ok: false, code: 'bad_signature' })
    expect(await v({ nowSeconds: T + 301 })).toEqual({ ok: false, code: 'expired' })
    expect(await v({ nowSeconds: T - 301 })).toEqual({ ok: false, code: 'expired' })
    expect((await v({ nowSeconds: T + 300 })).ok).toBe(true)
    expect(await v({ expectedConnectionId: 'cnx_2' })).toEqual({ ok: false, code: 'wrong_connection' })
    expect(await v({ headers: { ...headers, 'X-Edvora-Signature': '' } })).toEqual({ ok: false, code: 'missing_header' })
    expect(await v({ headers: { ...headers, 'X-Edvora-Timestamp': '17624232OO' } })).toEqual({ ok: false, code: 'bad_timestamp' })
    expect(await v({ headers: { ...headers, 'X-Edvora-Nonce': 'xyz' } })).toEqual({ ok: false, code: 'bad_nonce' })
    expect(await v({ headers: { ...headers, 'X-Edvora-Signature': 'abc' } })).toEqual({ ok: false, code: 'bad_signature' })
  })

  it('accepts a Headers object and does not burn the nonce on a bad signature', async () => {
    const headers = signRequest({ ...base, timestamp: T })
    const seenNonce = memoryNonceStore(600, () => T)
    expect((await verifyRequest({ ...base, body: 'x', headers: new Headers(headers), seenNonce, nowSeconds: T })).ok).toBe(false)
    expect((await verifyRequest({ ...base, headers: new Headers(headers), seenNonce, nowSeconds: T })).ok).toBe(true)
  })

  it('expires remembered nonces after the TTL', () => {
    let now = T
    const seen = memoryNonceStore(600, () => now)
    expect(seen('c', 'n')).toBe(false)
    expect(seen('c', 'n')).toBe(true)
    now += 601
    expect(seen('c', 'n')).toBe(false)
  })
})

describe('bundle signature', () => {
  it('matches the shared bundle vector', () => {
    expect(signBundle(vector.secret, vector.bundle.signedContent)).toBe(vector.bundle.signature)
    expect(verifyBundle(vector.secret, Buffer.from(vector.bundle.signedContent, 'utf8'), vector.bundle.signature)).toBe(true)
    expect(verifyBundle(vector.secret, `${vector.bundle.signedContent} `, vector.bundle.signature)).toBe(false)
    expect(verifyBundle(vector.secret, vector.bundle.signedContent, 'zz')).toBe(false)
  })
})
