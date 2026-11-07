import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { connectionUsable } from './service'
import { allowedHosts, checkMediaUrl, isPrivateAddress, MEDIA_LIMITS, pullMedia, PullError } from './ssrf'
import { newConnectionId, newSecret, openConnectionSecret, sealConnectionSecret } from './secrets'
import { chunkName, resolveStored } from './storage'

// E-032 QA: the media-pull guard against hostile input, secret handling, and static checks of the import code
// (permission check on every action, no hard deletes, no secret in logs, no unfiltered tenant queries).

const SRC = join(__dirname, '../..')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : []
  })
const importFiles = [
  ...walk(join(SRC, 'lib/wpimport')),
  ...walk(join(SRC, 'app/api/import')),
  ...walk(join(SRC, 'app/(frontend)/staff/(desk)/import')),
  ...walk(join(SRC, 'components/staff/import')),
  join(SRC, 'lib/redirects.ts'),
].filter((f) => !f.endsWith('.test.ts'))

const body = (b: Buffer) =>
  (async function* () {
    yield b
  })()

describe('media pull: SSRF and resource limits', () => {
  const hosts = allowedHosts(['https://academy.example.ir'])

  it('refuses every hostname trick: other host, userinfo, other port, scheme, IP literals in all notations', () => {
    const bad = [
      'https://evil.example/a.jpg',
      'https://academy.example.ir.evil.example/a.jpg',
      'https://academy.example.ir@evil.example/a.jpg',
      'https://academy.example.ir:8443/a.jpg', // host includes the port: another service on the same machine
      'file:///etc/passwd',
      'gopher://academy.example.ir/x',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//academy.example.ir/a.jpg',
    ]
    for (const u of bad) expect(checkMediaUrl(u, hosts).ok, u).toBe(false)
    // IP literals only matter when the admin (or the manifest) lists them as hosts: still refused.
    for (const u of ['http://127.0.0.1/a.jpg', 'http://2130706433/a.jpg', 'http://0x7f000001/a.jpg', 'http://[::1]/a.jpg', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:10.0.0.1]/a.jpg', 'http://10.0.0.1:8080/a.jpg']) {
      const r = checkMediaUrl(u, allowedHosts([u]))
      expect(r.ok, u).toBe(false)
    }
  })

  it('addresses: broad private/reserved ranges refused, public ones allowed', () => {
    for (const ip of ['0.1.2.3', '10.255.255.255', '127.1.1.1', '169.254.0.1', '172.20.0.1', '192.168.0.1', '198.18.0.1', '240.0.0.1', '255.255.255.255', '[::1]', 'FD12:3456::1', 'FE80::1', 'ff02::1', '::ffff:192.168.1.1', '64:ff9b::7f00:1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['1.1.1.1', '185.143.233.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('a hostname that resolves to loopback is refused at connect time (guarded DNS lookup), without any request', async () => {
    const h = allowedHosts(['http://localhost:9'])
    await expect(pullMedia('http://localhost:9/a.jpg', { hosts: h, timeoutMs: 2000 })).rejects.toMatchObject({ code: 'private_address' })
  })

  it('redirects to a private address, another host or another scheme are refused', async () => {
    const redirect = (location: string) => ({ hosts, get: async () => ({ status: 301, headers: { location }, body: body(Buffer.alloc(0)) }) })
    for (const to of ['http://169.254.169.254/latest', 'http://127.0.0.1:8080/x.jpg', 'https://evil.example/a.jpg', 'ftp://academy.example.ir/a.jpg']) {
      await expect(pullMedia('https://academy.example.ir/a.jpg', redirect(to)), to).rejects.toBeInstanceOf(PullError)
    }
    // A redirect loop ends after 3 hops.
    await expect(pullMedia('https://academy.example.ir/a.jpg', redirect('https://academy.example.ir/a.jpg'))).rejects.toMatchObject({ code: 'redirect' })
  })

  it('size caps: declared and streamed bodies over the limit are cut off; images have a lower cap than PDFs', async () => {
    const big = { hosts, get: async () => ({ status: 200, headers: { 'content-length': String(MEDIA_LIMITS.fileBytes + 1) }, body: body(Buffer.alloc(1)) }) }
    await expect(pullMedia('https://academy.example.ir/a.pdf', big)).rejects.toMatchObject({ code: 'too_large' })
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xdb])
    const image = Buffer.concat([jpegHeader, Buffer.alloc(MEDIA_LIMITS.imageBytes)])
    await expect(pullMedia('https://academy.example.ir/a.jpg', { hosts, get: async () => ({ status: 200, headers: {}, body: body(image) }) })).rejects.toMatchObject({ code: 'too_large' })
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(MEDIA_LIMITS.imageBytes)])
    const ok = await pullMedia('https://academy.example.ir/a.pdf', { hosts, get: async () => ({ status: 200, headers: {}, body: body(pdf) }) })
    expect(ok.kind.ext).toBe('pdf')
  })

  it('wrong content wins over the extension: HTML, SVG and scripts named .jpg/.png/.pdf are refused', async () => {
    for (const content of ['<html><script>alert(1)</script>', '<?xml version="1.0"?><svg onload="x()"/>', '#!/bin/sh\nrm -rf /', 'GIF', 'PK\u0003\u0004zip']) {
      await expect(pullMedia('https://academy.example.ir/a.jpg', { hosts, get: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' }, body: body(Buffer.from(content, 'latin1')) }) }), content).rejects.toMatchObject({ code: 'type' })
    }
  })

  it('5xx and 429 are retryable, 404 and 403 are not', async () => {
    for (const [status, retry] of [[500, true], [503, true], [429, true], [404, false], [403, false]] as const) {
      const err = await pullMedia('https://academy.example.ir/a.jpg', { hosts, get: async () => ({ status, headers: {}, body: body(Buffer.alloc(0)) }) }).catch((e: unknown) => e)
      expect(err, String(status)).toMatchObject({ code: 'http', retryable: retry })
    }
  })
})

describe('private storage names', () => {
  it('only random 32-hex names (and a safe chunk file inside them) resolve; traversal and odd names throw', () => {
    const name = 'a'.repeat(32)
    expect(() => resolveStored(name)).not.toThrow()
    expect(() => resolveStored(`${name}/wp.user.0.ndjson`)).not.toThrow()
    for (const bad of ['../etc/passwd', `${name}/../../x`, `${name}/..`, '/etc/passwd', 'a'.repeat(31), `${name}/a/b`, `${name}\\x`, '', 'ABCDEF'.repeat(6)]) {
      expect(() => resolveStored(bad), bad).toThrow()
    }
    // A kind with odd characters can't escape the job directory either (the push route also refuses such kinds first).
    const hostile = chunkName(name, '../../x', 0)
    expect(hostile.startsWith(`${name}/`)).toBe(true)
    expect(hostile.slice(name.length + 1)).not.toContain('/')
    expect(() => resolveStored(hostile)).toThrow()
  })
})

describe('connection secrets', () => {
  process.env.PAYLOAD_SECRET ??= 'qa-payload-secret-for-tests'

  it('32 random bytes, never repeated; ids are lowercase and unguessable', () => {
    const secrets = new Set(Array.from({ length: 50 }, newSecret))
    expect(secrets.size).toBe(50)
    for (const s of secrets) expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const ids = new Set(Array.from({ length: 50 }, newConnectionId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^cnx_[a-z0-9]{12}$/)
  })

  it('sealed copy never contains the secret, opens only with the server secret, and a tampered row opens as null', () => {
    const secret = newSecret()
    const row = sealConnectionSecret(secret)
    expect(JSON.stringify(row)).not.toContain(secret)
    expect(openConnectionSecret(row)).toBe(secret)
    expect(openConnectionSecret({ ...row, secretHash: 'f'.repeat(64) })).toBeNull() // hash does not match
    expect(openConnectionSecret({ ...row, secretSealed: `${row.secretSealed.slice(0, -4)}AAAA` })).toBeNull() // GCM tag fails
    expect(openConnectionSecret({ secretSealed: null, secretHash: row.secretHash })).toBeNull()
    const original = process.env.PAYLOAD_SECRET
    process.env.PAYLOAD_SECRET = 'a-different-server-secret'
    expect(openConnectionSecret(row)).toBeNull()
    process.env.PAYLOAD_SECRET = original
  })

  it('usable until revoked or expired; revoked wins; the boundary instant is expired', () => {
    const now = new Date('2026-11-06T10:00:00Z')
    const day = 86_400_000
    expect(connectionUsable({ revokedAt: null, expiresAt: new Date(now.getTime() + day).toISOString() }, now)).toBe('ok')
    expect(connectionUsable({ revokedAt: null, expiresAt: now.toISOString() }, now)).toBe('expired')
    expect(connectionUsable({ revokedAt: null, expiresAt: new Date(now.getTime() - 1).toISOString() }, now)).toBe('expired')
    expect(connectionUsable({ revokedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 3 * day).toISOString() }, now)).toBe('revoked')
    expect(connectionUsable({ revokedAt: now.toISOString(), expiresAt: new Date(now.getTime() - day).toISOString() }, now)).toBe('revoked')
  })
})

describe('import code, read as a reviewer', () => {
  it('every server action checks the import permission itself before doing anything', () => {
    const actions = read('app/(frontend)/staff/(desk)/import/actions.ts')
    const fns = [...actions.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]!)
    expect(fns.length).toBeGreaterThanOrEqual(9)
    for (const name of fns) {
      const start = actions.indexOf(`export async function ${name}(`)
      const next = actions.indexOf('export async function', start + 10)
      const block = actions.slice(start, next === -1 ? undefined : next)
      expect(block, name).toContain("importActor('import.run')")
      // The actor check comes before any service call or database access.
      const check = block.indexOf("importActor('import.run')")
      for (const risky of ['getPayloadClient()', 'createConnection(', 'ingestBundle(', 'confirmJob(', 'purgeJob(', 'revokeConnection(', 'startRest(', 'updateChoices(', 'resolveConflict(']) {
        const at = block.indexOf(risky)
        if (at !== -1) expect(at, `${name}: ${risky} before the permission check`).toBeGreaterThan(check)
      }
      // The academy always comes from the session, never from the form.
      expect(block, name).not.toMatch(/form\.get\(['"]tenant/)
    }
    const noComments = actions.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(noComments).not.toMatch(/(^|[^\w.])redirect\(/m) // AGENTS.md: return { redirectTo } instead
  })

  it('read routes check the session and import.view and filter by the session academy', () => {
    for (const rel of ['app/(frontend)/staff/(desk)/import/[job]/state/route.ts', 'app/(frontend)/staff/(desk)/import/[job]/redirects.csv/route.ts', 'app/(frontend)/staff/(desk)/import/plugin/route.ts']) {
      const src = read(rel)
      expect(src, rel).toContain('getStaffSession()')
      expect(src, rel).toContain("meets(s, { any: ['import.view'] })")
      if (!rel.endsWith('plugin/route.ts')) expect(src, rel).toContain('s.tenant.id')
    }
    expect(read('app/(frontend)/staff/(desk)/import/page.tsx')).toContain('requireImport(')
    expect(read('app/(frontend)/staff/(desk)/import/[job]/page.tsx')).toContain('requireImport(')
  })

  it('nothing is hard-deleted: no Payload delete except expired replay-guard rows, no SQL DELETE, no REST/API delete access', () => {
    for (const f of importFiles) {
      const code = readFileSync(f, 'utf8')
      const rel = relative(SRC, f)
      if (rel.endsWith('wpimport/nonces.ts')) {
        expect(code.match(/payload\.delete\(\{ collection: '([\w-]+)'/g)?.every((m) => m.includes("'import-nonces'")), rel).toBe(true)
        continue
      }
      expect(code, rel).not.toMatch(/\.delete\(\s*\{|\bDELETE\s+FROM\b|\.deleteMany/i)
    }
    const collections = read('collections/Import.ts')
    expect(collections.match(/delete: nobody/g)?.length).toBeGreaterThanOrEqual(5)
    expect(collections).not.toMatch(/delete:\s*allow/)
    // Files are removed only through removeStored (raw bundles, plan files, chunks: PII retention).
    for (const f of importFiles) {
      const code = readFileSync(f, 'utf8')
      if (!f.endsWith('storage.ts')) expect(code, relative(SRC, f)).not.toMatch(/\b(unlink|rmSync|rm)\(/)
    }
  })

  it('secrets are never logged, returned or put in audit rows', () => {
    for (const f of importFiles) {
      const code = readFileSync(f, 'utf8')
      const rel = relative(SRC, f)
      for (const line of code.split('\n')) {
        if (/logger\.(error|warn|info|debug)/.test(line)) expect(line, `${rel}: ${line.trim()}`).not.toMatch(/secret|applicationPassword|consumerKey|password/i)
        if (/Response\.json|json\(\{/.test(line)) expect(line, `${rel}: ${line.trim()}`).not.toMatch(/secret(Hash|Sealed)|restSealed/)
      }
    }
    const svc = read('lib/wpimport/service.ts')
    const audit = svc.slice(svc.indexOf('export async function auditImport'), svc.indexOf('// ---------------------------------------------------------------- reads'))
    // Audit rows carry ids, counts and notes only: the fixed set of fields, no free-form record data.
    const keys = [...audit.slice(audit.indexOf('data: {')).matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1])
    expect(keys).toEqual(['tenant', 'actor', 'actorEmail', 'action', 'targetCollection', 'docId', 'changes', 'note'])
    expect(audit).not.toMatch(/secret|phone/i)
    // The plain secret leaves createConnection exactly once, to the action that shows it.
    expect(svc.match(/secret,?\s*\}/g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(read('collections/Import.ts')).toMatch(/secretHash[\s\S]{0,120}hidden: true[\s\S]{0,80}read: never/)
    expect(read('collections/Import.ts')).toMatch(/secretSealed[\s\S]{0,120}hidden: true[\s\S]{0,80}read: never/)
  })

  it('every tenant-scoped lookup in the push path and the services names the academy', () => {
    const push = read('lib/wpimport/push.ts')
    expect(push).toContain('findConnection(payload, tenant.id, cid)')
    expect(push).toContain('findJob(payload, tenant.id, jobId, true)')
    const svc = read('lib/wpimport/service.ts')
    for (const fn of ['findJob', 'findConnection']) {
      const at = svc.indexOf(`export async function ${fn}`)
      expect(svc.slice(at, at + 600), fn).toMatch(/tenant: \{ equals: tenantId \}/)
    }
    const commit = read('lib/wpimport/commit.ts')
    expect(commit).toMatch(/loadJobForTask[\s\S]{0,300}tenant: \{ equals: tenantId \}/)
    // Redirect lookups are always per academy.
    expect(read('lib/redirects.ts')).toMatch(/tenant: \{ equals: tenantId \}/)
  })

  it('the verifier path: rate limit and size limit before the signature, signature before any write, constant-time compare', () => {
    const push = read('lib/wpimport/push.ts')
    const order = ['secureEnough(request)', 'findConnection(', 'connectionUsable(', 'rateLimited(', 'readBody(request)', 'verifyRequest(', 'lastUsedAt']
    let last = -1
    for (const marker of order) {
      const at = push.indexOf(marker)
      expect(at, marker).toBeGreaterThan(last)
      last = at
    }
    expect(push).toContain('CHUNK_MAX_BYTES')
    expect(push).toContain("'Cache-Control': 'no-store'")
    expect(push).not.toMatch(/console\.(log|error)\(/)
  })
})
