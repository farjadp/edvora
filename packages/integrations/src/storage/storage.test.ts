import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createMockStorage, createObjectStorage, createS3Storage, ensureS3Bucket, objectKey } from '.'

describe('objectKey', () => {
  it('namespaces by tenant and strips unsafe characters', () => {
    expect(objectKey(3, 'recordings', 42, 'rec-1.mp4')).toBe('3/recordings/42/rec-1.mp4')
    const evil = objectKey(3, 'recordings', '../../etc', 'a b?.mp4')
    expect(evil.split('/')).toHaveLength(4) // no part can add a path level
    expect(evil.split('/').some((p) => p.startsWith('.'))).toBe(false)
    expect(evil.endsWith('/a_b_.mp4')).toBe(true)
    expect(objectKey(3, 'x', '..')).toBe('3/x/_')
  })
})

describe('mock storage', () => {
  it('stores streams and bytes, heads, signs and deletes', async () => {
    const s = createMockStorage({ mockBaseUrl: 'http://x/mock' })
    const key = objectKey(1, 'test', randomUUID())
    const put = await s.putObject({ key, body: Readable.from([Buffer.from('hello '), Buffer.from('world')]), contentType: 'video/mp4' })
    expect(put.size).toBe(11)
    expect(await s.headObject(key)).toMatchObject({ size: 11, contentType: 'video/mp4' })
    expect(await s.signedGetUrl(key)).toMatch(/^http:\/\/x\/mock\/1\/test\//)
    await s.deleteObject(key)
    expect(await s.headObject(key)).toBeNull()
  })
})

describe('factory', () => {
  it('defaults to mock and validates S3 config', () => {
    expect(createObjectStorage({ provider: undefined }).name).toBe('mock')
    expect(() => createS3Storage({ endpoint: 'http://x', bucket: '', accessKeyId: 'a', secretAccessKey: 'b' })).toThrow(/bucket/)
  })
})

/**
 * Real S3 round trip, opt-in, against the local SeaweedFS from infra/docker/compose.local.yml:
 * `S3_TEST_ENDPOINT=http://localhost:9010 S3_TEST_KEY=edvora S3_TEST_SECRET=edvora-local-secret pnpm test`
 */
const endpoint = process.env.S3_TEST_ENDPOINT
describe.skipIf(!endpoint)('s3 storage (integration)', () => {
  it('uploads a multipart-sized stream, heads, signs and deletes', async () => {
    const opts = { endpoint: endpoint!, bucket: process.env.S3_TEST_BUCKET ?? 'edvora-test', accessKeyId: process.env.S3_TEST_KEY ?? 'edvora', secretAccessKey: process.env.S3_TEST_SECRET ?? 'edvora-local-secret' }
    await ensureS3Bucket(opts)
    const s = createS3Storage(opts)
    const key = objectKey(1, 'test', `${randomUUID()}.bin`)
    const size = 17 * 1024 * 1024 // > one 16 MB part
    const put = await s.putObject({ key, body: Readable.from([Buffer.alloc(size, 7)]), contentType: 'application/octet-stream' })
    expect(put.size).toBe(size)
    const url = await s.signedGetUrl(key, { expiresInSec: 60 })
    const res = await fetch(url, { headers: { range: 'bytes=0-3' } })
    expect([200, 206]).toContain(res.status)
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(7)
    const unsigned = await fetch(`${endpoint}/${opts.bucket}/${key}`)
    expect(unsigned.status).toBe(403) // private bucket: no signature, no file
    await s.deleteObject(key)
    expect(await s.headObject(key)).toBeNull()
  }, 60_000)
})
