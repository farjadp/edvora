import { Readable } from 'node:stream'
import type { ObjectStorage } from './types'

type Entry = { bytes: Uint8Array; contentType: string }
const store = new Map<string, Entry>()

async function toBytes(body: Readable | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

/** In-memory storage for tests and offline dev. `signedGetUrl` points at `mockBaseUrl` (no real file is served). */
export function createMockStorage(opts: { mockBaseUrl?: string } = {}): ObjectStorage & { keys(): string[]; read(key: string): Uint8Array | null } {
  const base = opts.mockBaseUrl ?? 'http://localhost:3000/mock-storage'
  return {
    name: 'mock',
    async putObject({ key, body, contentType }) {
      const bytes = await toBytes(body)
      store.set(key, { bytes, contentType })
      return { key, size: bytes.length, contentType }
    },
    async headObject(key) {
      const e = store.get(key)
      return e ? { key, size: e.bytes.length, contentType: e.contentType } : null
    },
    async signedGetUrl(key, o = {}) {
      return `${base}/${key.split('/').map(encodeURIComponent).join('/')}?exp=${Date.now() + (o.expiresInSec ?? 300) * 1000}`
    },
    async deleteObject(key) {
      store.delete(key)
    },
    keys: () => [...store.keys()],
    read: (key) => store.get(key)?.bytes ?? null,
  }
}

export const toReadable = (bytes: Uint8Array) => Readable.from([Buffer.from(bytes)])
