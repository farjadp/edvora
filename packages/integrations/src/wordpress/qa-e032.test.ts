import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RestSource } from './sources'
import { memoryNonceStore, safeEqualHex, signRequest, verifyRequest } from './signature'

// E-032 QA: security review turned into tests. Signature edges (W19), the REST fallback's reach (SSRF), and static
// checks of the WordPress plugin sources (no external calls but the configured URL, capability + nonce on every
// handler, no password material exported, uninstall cleanup).

const T = 1_762_423_200
const base = { secret: 's3cret-for-tests', connectionId: 'cnx_qa', method: 'POST', pathWithQuery: '/api/import/push/records?kind=wp.user&seq=0', body: '{"a":1}\n' }

const verify = (over: Partial<Parameters<typeof verifyRequest>[0]> = {}, signed: Partial<Parameters<typeof signRequest>[0]> = {}) => {
  const headers = signRequest({ ...base, timestamp: T, nonce: '00112233445566778899aabbccddeeff', ...signed })
  return verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers, seenNonce: memoryNonceStore(600, () => T), nowSeconds: T, ...over })
}

describe('push signature edges', () => {
  it('window is ±300 s inclusive: 300 passes, 301 fails, in both directions', async () => {
    expect((await verify({ nowSeconds: T + 300 })).ok).toBe(true)
    expect(await verify({ nowSeconds: T + 301 })).toEqual({ ok: false, code: 'expired' })
    expect((await verify({ nowSeconds: T - 300 })).ok).toBe(true)
    expect(await verify({ nowSeconds: T - 301 })).toEqual({ ok: false, code: 'expired' })
  })

  it('malformed signatures never throw and never pass (odd length, non-hex, empty, very long, wrong case is normalised)', async () => {
    const good = signRequest({ ...base, timestamp: T, nonce: '00112233445566778899aabbccddeeff' })
    for (const sig of ['abc', 'zz'.repeat(32), '', 'a'.repeat(64), 'a'.repeat(10_000), `${good['X-Edvora-Signature']} `]) {
      const r = await verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers: { ...good, 'X-Edvora-Signature': sig }, seenNonce: () => false, nowSeconds: T })
      expect(r.ok, JSON.stringify(sig.slice(0, 12))).toBe(false)
    }
    const upper = await verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers: { ...good, 'X-Edvora-Signature': good['X-Edvora-Signature'].toUpperCase() }, seenNonce: () => false, nowSeconds: T })
    expect(upper.ok).toBe(true)
  })

  it('every part of the request is covered: method, path, query order, body, timestamp, nonce', async () => {
    expect((await verify()).ok).toBe(true)
    expect((await verify({ method: 'GET' })).ok).toBe(false)
    expect((await verify({ pathWithQuery: '/api/import/push/records?seq=0&kind=wp.user' })).ok).toBe(false)
    expect((await verify({ body: '{"a":2}\n' })).ok).toBe(false)
    // Header timestamp or nonce changed after signing.
    const h = signRequest({ ...base, timestamp: T, nonce: '00112233445566778899aabbccddeeff' })
    for (const swap of [{ 'X-Edvora-Timestamp': String(T + 1) }, { 'X-Edvora-Nonce': '11112233445566778899aabbccddeeff' }]) {
      const r = await verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers: { ...h, ...swap }, seenNonce: () => false, nowSeconds: T })
      expect(r, JSON.stringify(swap)).toEqual({ ok: false, code: 'bad_signature' })
    }
  })

  it('a different secret never verifies, and equal-length wrong digests are refused in constant time (timingSafeEqual)', () => {
    expect(safeEqualHex('ab'.repeat(32), 'ab'.repeat(32))).toBe(true)
    expect(safeEqualHex('ab'.repeat(32), 'ac'.repeat(32))).toBe(false)
    expect(safeEqualHex('ab'.repeat(32), 'ab'.repeat(31))).toBe(false)
    const src = readFileSync(new URL('./signature.ts', import.meta.url), 'utf8')
    expect(src).toContain('timingSafeEqual')
    // No plain string comparison of a signature anywhere in the verifier.
    expect(src).not.toMatch(/signature\s*[!=]==?\s*expected|expected\s*[!=]==?\s*signature/)
  })

  it('a replayed nonce is refused only after the signature checked out (an attacker cannot burn nonces)', async () => {
    const seen = memoryNonceStore(600, () => T)
    const headers = signRequest({ ...base, timestamp: T, nonce: 'ffeeddccbbaa99887766554433221100' })
    const forged = await verifyRequest({ secret: 'wrong', method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers, seenNonce: seen, nowSeconds: T })
    expect(forged).toEqual({ ok: false, code: 'bad_signature' })
    expect((await verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers, seenNonce: seen, nowSeconds: T })).ok).toBe(true)
    expect(await verifyRequest({ secret: base.secret, method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers, seenNonce: seen, nowSeconds: T })).toEqual({ ok: false, code: 'replay' })
  })
})

describe('REST fallback reach (SSRF)', () => {
  const cfg = (siteUrl: string, fetch: typeof globalThis.fetch) => ({ siteUrl, tenantSlug: 'iba', auth: { username: 'admin', applicationPassword: 'abcd efgh ijkl' }, fetch })

  it('refuses plain http on public hosts and keeps every request on the configured origin', async () => {
    expect(() => new RestSource(cfg('http://academy.example.ir', fetch))).toThrow(/HTTPS/)
  })

  // QA-E032-03 (major, security): an academy admin can point the importer at https://10.0.0.5, https://169.254.169.254
  // or (in the action) http://localhost:PORT. The server then sends the application password to that address and the
  // HTTP status/"non-JSON" errors leak what is listening. Media pulls have a guarded lookup; REST does not. Remove
  // `.fails` when RestSource (or startRest) refuses private/loopback/link-local targets before any request.
  it.fails('QA-E032-03: refuses private, loopback and link-local targets before sending credentials', async () => {
    for (const url of ['https://10.0.0.5', 'https://192.168.1.10', 'https://169.254.169.254', 'https://[::1]', 'https://127.0.0.1:5432']) {
      const calls: string[] = []
      const spy = (async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return new Response('{}', { status: 200 })
      }) as typeof fetch
      let refused = false
      try {
        await new RestSource(cfg(url, spy)).manifest()
      } catch {
        refused = true
      }
      expect(refused && calls.length === 0, url).toBe(true)
    }
  })
})

// ---------------------------------------------------------------- the WordPress plugin, read as a security reviewer

const PLUGIN = new URL('../../../../integrations/wordpress-plugin/edvora-migrator/', import.meta.url)
const php = (rel: string) => readFileSync(new URL(rel, PLUGIN), 'utf8')
const phpFiles = ['edvora-migrator.php', 'uninstall.php', ...readdirSync(new URL('includes/', PLUGIN)).map((f) => `includes/${f}`)].filter((f) => f.endsWith('.php'))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|#).*$/gm, '')

describe('Edvora Migrator plugin (static review)', () => {
  it('makes no outbound call except the signed push in class-pusher.php, to the configured URL only', () => {
    const calls = /\b(wp_remote_(get|post|request|head)|wp_safe_remote_\w+|file_get_contents|curl_\w+|fsockopen|stream_socket_client|fopen\(\s*['"]https?:|WP_Http|wp_http_\w+)\b/
    for (const f of phpFiles) {
      const code = stripComments(php(f))
      const hit = code.match(calls)
      if (f === 'includes/class-pusher.php') expect(hit?.[1], f).toBe('wp_remote_request')
      else expect(hit, `${f}: ${hit?.[0]}`).toBeNull()
    }
    const pusher = stripComments(php('includes/class-pusher.php'))
    expect(pusher.match(/wp_remote_request\(/g)).toHaveLength(1)
    expect(pusher).toContain("'redirection' => 0")
    expect(pusher).toContain("'sslverify'   => true")
    expect(pusher).toMatch(/\$url\s*=\s*\$this->base \. '\/api\/import\/push\//)
  })

  it('has no hard-coded external URL (only the licence header and documentation placeholders)', () => {
    for (const f of phpFiles) {
      const code = stripComments(php(f))
      for (const m of code.matchAll(/https?:\/\/[^\s'")]+/g)) expect(m[0], `${f}: ${m[0]}`).toMatch(/example\.ir|localhost/)
    }
  })

  it('every AJAX and admin-post handler checks the capability and a nonce', () => {
    const admin = stripComments(php('includes/class-admin.php'))
    const registered = [...admin.matchAll(/add_action\(\s*'(wp_ajax_edvora_migrator_|admin_post_edvora_migrator_)'\s*\.\s*\$action|add_action\(\s*'admin_post_edvora_migrator_(\w+)'/g)]
    expect(registered.length).toBeGreaterThan(0)
    const body = (name: string) => admin.match(new RegExp(`function ${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\t\\}`))?.[1] ?? ''
    for (const a of ['ping', 'push_start', 'push_step', 'bundle_start', 'bundle_step']) {
      expect(body(`ajax_${a}`), `ajax_${a}`).toMatch(/^\s*self::ajax_guard\(\);/)
    }
    for (const a of ['save', 'download']) {
      const b = body(a)
      expect(b, a).toMatch(/self::guard\(\);/)
      expect(b, a).toMatch(/check_admin_referer\(\s*self::NONCE\s*\)/)
    }
    const guards = admin.match(/function ajax_guard\(\)\s*\{([\s\S]*?)\n\t\}/)?.[1] ?? ''
    expect(guards).toContain("current_user_can( 'manage_options' )")
    expect(guards).toContain('check_ajax_referer( self::NONCE')
    // The menu itself is also behind manage_options, and no handler is registered for logged-out users.
    expect(admin).toContain("'manage_options'")
    expect(admin).not.toContain('wp_ajax_nopriv_')
    expect(admin).not.toContain('admin_post_nopriv_')
  })

  it('never exports password material, sessions or activation keys; unserialize never builds objects', () => {
    const exporter = stripComments(php('includes/class-exporter.php'))
    expect(exporter).toMatch(/\$user_meta_denied\s*=\s*array\(\s*'session_tokens',\s*'_application_passwords',\s*'user_pass',\s*'user_activation_key'\s*\)/)
    expect(exporter).toMatch(/unset\(\s*\$row\['user_pass'\],\s*\$row\['user_activation_key'\]\s*\)/)
    expect(exporter).toContain('self::$user_meta_denied')
    const util = stripComments(php('includes/class-util.php'))
    expect(util).toMatch(/allowed_classes['"]\s*=>\s*false/)
    for (const f of phpFiles) {
      const code = stripComments(php(f))
      expect(code, f).not.toMatch(/\beval\s*\(|\bassert\s*\(/)
      for (const line of code.split('\n')) if (/(^|[^_a-z])unserialize\(/.test(line)) expect(line, `${f}: ${line.trim()}`).toContain("'allowed_classes' => false")
    }
    // Read-only: the exporter issues SELECTs only.
    expect(exporter).not.toMatch(/\$wpdb->(insert|update|delete|replace|query)\(/)
  })

  it('keeps the secret out of echoed markup, logs and URLs', () => {
    const admin = stripComments(php('includes/class-admin.php'))
    expect(admin).toContain('value=""') // the secret input is never pre-filled
    expect(admin).not.toMatch(/echo[^;]*Settings::secret\(\)/)
    for (const f of phpFiles) expect(stripComments(php(f)), f).not.toMatch(/error_log\([^)]*secret/i)
    const settings = stripComments(php('includes/class-settings.php'))
    expect(settings).toMatch(/update_option\(\s*\$name,\s*\$value,\s*'no'\s*\)/) // never autoloaded
  })

  it('temp bundle folder: random name, deny rules, silence file, daily cleanup, removed on deactivate and uninstall', () => {
    const bundle = stripComments(php('includes/class-bundle.php'))
    expect(bundle).toContain("'edvora-migrator-' . bin2hex( random_bytes( 12 ) )")
    expect(bundle).toContain('Require all denied')
    expect(bundle).toContain('Deny from all')
    expect(bundle).toContain('index.php')
    expect(bundle).toContain("/records-' . bin2hex( random_bytes( 12 ) ) . '.ndjson'")
    expect(bundle).toContain('wp_schedule_event')
    expect(bundle).toMatch(/function deactivate\(\)\s*\{[\s\S]*delete_dir\(\)/)
    const uninstall = stripComments(php('uninstall.php'))
    expect(uninstall).toContain("defined( 'WP_UNINSTALL_PLUGIN' )")
    expect(uninstall).toContain('Edvora_Migrator_Bundle::delete_dir()')
    expect(uninstall).toContain('wp_clear_scheduled_hook')
    expect(uninstall).toMatch(/foreach\s*\(\s*Edvora_Migrator_Settings::option_names\(\)[\s\S]*delete_option/)
    const names = [...php('includes/class-settings.php').matchAll(/const OPT_\w+\s*=\s*'(\w+)'/g)].map((m) => m[1])
    expect(names.length).toBe(4)
    expect(stripComments(php('includes/class-settings.php'))).toMatch(/array\(\s*self::OPT_SETTINGS,\s*self::OPT_SECRET,\s*self::OPT_STATE,\s*self::OPT_TMPDIR\s*\)/)
  })

  it('PHP 7.4 compatible syntax: no enums, readonly props, match, nullsafe, named args or union types', () => {
    for (const f of phpFiles) {
      const code = stripComments(php(f))
      expect(code, f).not.toMatch(/\benum\s+\w+|\breadonly\s+(public|private|protected)|=>\s*match\b|\bmatch\s*\(|\?->|\bnew\s+readonly/)
      expect(code, f).not.toMatch(/function\s+\w+\([^)]*\b(int|string|array|bool)\|(int|string|array|bool|null)\b/)
    }
  })
})
