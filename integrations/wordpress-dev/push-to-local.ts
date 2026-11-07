/**
 * Pushes a fixture bundle to a local Edvora through the REAL push API (FORMAT.md §2, §5), exactly like the plugin:
 * signed ping → manifest → NDJSON chunks (≤ 500 records per kind) → finish. Local development only.
 *
 *   ./push-to-local.sh [base-url] [bundle] [connection-id] [secret]
 *   defaults: http://demo.localhost:3000, fixtures/sample-latest.edvora-bundle, cnx_fixture, edvora-fixture-secret
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHUNK_MAX_RECORDS, readBundle, signRequest, type SourceRecord } from '../../packages/integrations/src/wordpress/index'

const [base = 'http://demo.localhost:3000', bundlePath = resolve(__dirname, '../../packages/integrations/src/wordpress/fixtures/sample-latest.edvora-bundle'), connectionId = 'cnx_fixture', secret = 'edvora-fixture-secret'] = process.argv.slice(2)

async function send(method: 'GET' | 'POST', path: string, body?: string, contentType = 'application/json') {
  const headers = signRequest({ secret, connectionId, method, pathWithQuery: path, body: body ?? '' })
  const res = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body !== undefined ? { 'Content-Type': contentType } : {}) }, body })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  console.log(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
  if (!res.ok) throw new Error(`push failed at ${path}`)
  return json
}

async function main() {
  const reader = await readBundle(readFileSync(bundlePath), secret)
  const byKind = new Map<string, SourceRecord[]>()
  for await (const r of reader.records()) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r])
  await send('GET', '/api/import/push/ping')
  const { type: _t, ...manifest } = reader.manifest as typeof reader.manifest & { type?: string }
  await send('POST', '/api/import/push/manifest', JSON.stringify({ ...manifest, connectionId }))
  const chunks: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const [kind, records] of byKind) {
    for (let i = 0, seq = 1; i < records.length; i += CHUNK_MAX_RECORDS, seq++) {
      const body = records.slice(i, i + CHUNK_MAX_RECORDS).map((r) => `${JSON.stringify(r)}\n`).join('')
      await send('POST', `/api/import/push/records?kind=${encodeURIComponent(kind)}&seq=${seq}`, body, 'application/x-ndjson')
      chunks[kind] = seq
    }
    counts[kind] = records.length
  }
  await send('POST', '/api/import/push/finish', JSON.stringify({ chunks, counts }))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
