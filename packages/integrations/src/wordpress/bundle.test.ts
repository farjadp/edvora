import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { BundleError, bundleBody, readBundle, writeBundle } from './bundle'
import { makeRecord } from './format'
import { MOCK_SECRET, mockManifest, mockRecords } from './mock'
import { BundleSource } from './sources'
import { signBundle } from './signature'

async function collect(it: AsyncIterable<unknown>) {
  const out: unknown[] = []
  for await (const x of it) out.push(x)
  return out
}

async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return e instanceof BundleError ? e.code : `other:${String(e)}`
  }
}

describe('bundle', () => {
  it('round-trips manifest and records', async () => {
    const buf = writeBundle(mockManifest, mockRecords, MOCK_SECRET)
    const reader = await readBundle(buf, MOCK_SECRET)
    expect(reader.manifest.site.homeUrl).toBe(mockManifest.site.homeUrl)
    expect(reader.recordLines).toBe(mockRecords.length)
    const records = await collect(reader.records())
    expect(records).toEqual(mockRecords)
  })

  it('reads from a stream factory in small chunks (two passes)', async () => {
    const buf = writeBundle(mockManifest, mockRecords.slice(0, 5), MOCK_SECRET)
    const factory = async function* () {
      for (let i = 0; i < buf.length; i += 7) yield buf.subarray(i, i + 7)
    }
    const source = await BundleSource.open(factory, MOCK_SECRET)
    expect((await source.read('wp.user', null, 2)).records.map((r) => r.wpId)).toEqual(['1', '2'])
    expect((await source.read('wp.user', '2', 10)).next).toBeNull()
  })

  it('refuses a tampered bundle before yielding any record', async () => {
    const body = bundleBody(mockManifest, mockRecords)
    const good = writeBundle(mockManifest, mockRecords, MOCK_SECRET)
    const text = gunzipSync(good).toString('utf8')
    const tampered = gzipSync(Buffer.from(text.replace('"digits_phone":"+989121234567"', '"digits_phone":"+989120000000"'), 'utf8'))
    expect(await code(readBundle(tampered, MOCK_SECRET))).toBe('bad_signature')
    expect(await code(readBundle(good, 'wrong-secret'))).toBe('bad_signature')
    expect(await code(readBundle(gzipSync(Buffer.from(body, 'utf8')), MOCK_SECRET))).toBe('missing_signature')
    expect(await code(readBundle(gzipSync(Buffer.from(`${body}{"type":"signature","alg":"MD5","value":"00"}\n`)), MOCK_SECRET))).toBe('missing_signature')
    expect(await code(readBundle(gzipSync(Buffer.from(`${body}\n`)), MOCK_SECRET))).toBe('missing_signature')
    expect(await code(readBundle(Buffer.from('not gzip'), MOCK_SECRET))).toBe('not_gzip')
    expect(await code(readBundle(gzipSync(Buffer.alloc(0)), MOCK_SECRET))).toBe('empty')
    expect(await code(readBundle(good, MOCK_SECRET, { maxUncompressedBytes: 100 }))).toBe('too_large')
  })

  it('refuses a correctly signed bundle whose manifest or records break the contract', async () => {
    const sign = (content: string) => gzipSync(Buffer.from(`${content}{"type":"signature","alg":"HMAC-SHA256","value":"${signBundle(MOCK_SECRET, content)}"}\n`, 'utf8'))
    expect(await code(readBundle(sign('{"type":"manifest","format":"other"}\n'), MOCK_SECRET))).toBe('bad_manifest')
    const bad = `${JSON.stringify({ type: 'manifest', ...mockManifest })}\n${JSON.stringify({ ...makeRecord('wp.user', 1, {}), extra: 1 })}\n`
    const reader = await readBundle(sign(bad), MOCK_SECRET)
    expect(await code(collect(reader.records()))).toBe('invalid_record')
    const lines: number[] = []
    const lenient = await readBundle(sign(bad), MOCK_SECRET, { onInvalidRecord: (line) => lines.push(line) })
    expect(await collect(lenient.records())).toEqual([])
    expect(lines).toEqual([2])
  })
})
