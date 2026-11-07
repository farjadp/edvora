import { fieldsChecksum } from '@edvora/integrations/wordpress'
import { describe, expect, it } from 'vitest'
import { docChecksum, docValues, parseRefKey, resolveRelations, toDocData, unionIds, UnresolvedRef } from './docValues'
import { decodeEntities, htmlToLexical, safeHref } from './htmlToLexical'
import { nonceStore, type NonceRepo } from './nonces'
import { allowedHosts, checkMediaUrl, isPrivateAddress, pullMedia, PullError, sniffMedia } from './ssrf'
import { buildZip, crc32 } from './zip'

// ---------------------------------------------------------------- HTML → Lexical

type Node = { type: string; text?: string; format?: number; children?: Node[]; tag?: string; fields?: { url?: string }; value?: unknown; listType?: string }
const kids = (doc: ReturnType<typeof htmlToLexical>) => (doc?.root.children ?? []) as Node[]
const texts = (n: Node): string => (n.text ?? '') + (n.children ?? []).map(texts).join('')

describe('htmlToLexical', () => {
  it('paragraphs, headings, inline formats and a safe link', () => {
    const doc = htmlToLexical('<h1>عنوان</h1><p>سلام <strong>دنیا</strong> و <em>تو</em> <a href="https://example.ir/x" onclick="evil()">پیوند</a></p>')
    const [h, p] = kids(doc)
    expect(h).toMatchObject({ type: 'heading', tag: 'h2' })
    expect(texts(h!)).toBe('عنوان')
    expect(p?.type).toBe('paragraph')
    expect(p?.children?.find((c) => c.text === 'دنیا')?.format).toBe(1)
    expect(p?.children?.find((c) => c.text === 'تو')?.format).toBe(2)
    const link = p?.children?.find((c) => c.type === 'link')
    expect(link?.fields?.url).toBe('https://example.ir/x')
    expect(doc?.root.direction).toBe('rtl')
  })

  it('drops scripts, styles, iframes and javascript: links with their content', () => {
    const doc = htmlToLexical('<p>a<script>alert(1)</script>b</p><style>p{}</style><iframe src="https://x"></iframe><p><a href="javascript:alert(1)">c</a></p>')
    expect(kids(doc).map(texts)).toEqual(['ab', 'c'])
    expect(JSON.stringify(doc)).not.toMatch(/alert|javascript|iframe/)
    expect(kids(doc)[1]?.children?.some((c) => c.type === 'link')).toBe(false)
  })

  it('keeps ZWNJ and decodes entities', () => {
    expect(decodeEntities('می&zwnj;شود &amp; &#1588; &#x6cc;')).toBe('می‌شود & ش ی')
    expect(texts(kids(htmlToLexical('<p>کتاب‌ها&nbsp;و</p>'))[0]!)).toBe('کتاب‌ها و')
  })

  it('lists, quotes, rules and line breaks', () => {
    const doc = htmlToLexical('<ul><li>یک</li><li>دو<ol><li>الف</li></ol></li></ul><blockquote><p>نقل</p></blockquote><hr><p>خط<br>دوم</p>')
    const [list, quote, hr, p] = kids(doc)
    expect(list).toMatchObject({ type: 'list', listType: 'bullet' })
    expect(list?.children).toHaveLength(2)
    expect(list?.children?.[1]?.children?.some((c) => c.type === 'list')).toBe(true)
    expect(quote?.type).toBe('quote')
    expect(hr?.type).toBe('horizontalrule')
    expect(p?.children?.map((c) => c.type)).toEqual(['text', 'linebreak', 'text'])
  })

  it('images become upload nodes only when the media was imported; uploads links are rewritten', () => {
    const resolve = (url: string) => (url.includes('/wp-content/uploads/a.jpg') || url.includes('/wp-content/uploads/a-300x200.jpg') ? { id: 7, url: '/api/media/file/a.jpg' } : null)
    const doc = htmlToLexical('<p>متن <img src="https://x.ir/wp-content/uploads/a.jpg" alt="a"> <img src="https://evil.example/b.png"></p><p><a href="https://x.ir/wp-content/uploads/a.jpg">فایل</a></p>', resolve)
    const nodes = kids(doc)
    expect(nodes.filter((n) => n.type === 'upload').map((n) => n.value)).toEqual([7])
    expect(JSON.stringify(doc)).not.toContain('evil.example')
    expect(nodes.at(-1)?.children?.[0]?.fields?.url).toBe('/api/media/file/a.jpg')
  })

  it('empty or tag-only HTML → null; safeHref allow-list', () => {
    expect(htmlToLexical('')).toBeNull()
    expect(htmlToLexical('<p> </p><div></div>')).toBeNull()
    expect(safeHref('/courses/x')).toBe('/courses/x')
    expect(safeHref('//evil.example')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
  })
})

// ---------------------------------------------------------------- draft ↔ doc adapters

describe('docValues / toDocData (planner ctx adapters)', () => {
  const site = 'f92152fb'
  it('parses refKeys whose wpId has separators', () => {
    expect(parseRefKey(`${site}:woo.order:56#3`)).toEqual({ siteId: site, kind: 'woo.order', wpId: '56#3' })
    expect(parseRefKey(`${site}:edvora.enrollment:2>lifterlms.course:26`)).toEqual({ siteId: site, kind: 'edvora.enrollment', wpId: '2>lifterlms.course:26' })
    expect(parseRefKey('nope')).toBeNull()
  })

  it('resolves $ref/$id, drops unresolved soft refs, throws for hard dependencies', () => {
    const ids: Record<string, number> = { a: 1, b: 2 }
    const resolve = (k: string) => ids[k] ?? null
    expect(resolveRelations({ user: { $ref: 'a' }, list: [{ $ref: 'b' }, { $ref: 'x' }], course: { $id: 9 } }, resolve, new Set())).toEqual({ user: 1, list: [2], course: 9 })
    expect(() => resolveRelations({ user: { $ref: 'x' } }, resolve, new Set(['x']))).toThrow(UnresolvedRef)
  })

  it('lessons, quizzes and questions: WordPress HTML → the E-031 Lexical field, readable back for checksums', () => {
    const cases = [
      ['lessons', 'notesHtml', 'notes'],
      ['quizzes', 'descriptionHtml', 'description'],
      ['questions', 'explanationHtml', 'explanation'],
    ] as const
    for (const [collection, htmlKey, field] of cases) {
      const data = toDocData(collection, { title: 'T', [htmlKey]: '<p>اول</p><ul><li>یک</li></ul>' }, { resolve: () => null, dependsOn: [] })
      expect(data).not.toHaveProperty(htmlKey)
      const doc = data[field] as { root: { children: { type: string }[] } }
      expect(doc.root.children.map((c) => c.type)).toEqual(['paragraph', 'list'])
      expect(docValues(collection, { [field]: doc })[htmlKey]).toEqual(doc)
      expect(toDocData(collection, { title: 'T' }, { resolve: () => null, dependsOn: [] })).not.toHaveProperty(field)
    }
  })

  it('posts: bodyHtml → Lexical body, sourceUrl kept (E-030 column), courses get a 0 price when none', () => {
    const post = toDocData('posts', { title: 'T', bodyHtml: '<p>سلام</p>', sourceUrl: 'https://x.ir/t/' }, { resolve: () => null, dependsOn: [] })
    expect(post.sourceUrl).toBe('https://x.ir/t/')
    expect(post).not.toHaveProperty('bodyHtml')
    expect((post.body as { root: { children: unknown[] } }).root.children).toHaveLength(1)
    expect(toDocData('courses', { title: 'c', price: null, sourceUrl: 'x' }, { resolve: () => null, dependsOn: [] })).toEqual({ title: 'c', price: 0, sourceUrl: 'x' })
    expect(toDocData('media', { alt: 'a', filename: 'f.png', mimeType: 'image/png', sourceUrl: 'https://x.ir/f.png' }, { resolve: () => null, dependsOn: [] })).toEqual({ alt: 'a', sourceUrl: 'https://x.ir/f.png' })
  })

  it('pages (E-030): bodyHtml → Lexical body, excerpt → intro, round-trips through docValues for the checksum', () => {
    const fields = { title: 'درباره ما', slug: 'درباره-ما', excerpt: 'معرفی', bodyHtml: '<p>متن</p>', status: 'published', sourceUrl: 'https://x.ir/about/' }
    const page = toDocData('pages', fields, { resolve: () => null, dependsOn: [] })
    expect(page).toMatchObject({ title: 'درباره ما', slug: 'درباره-ما', intro: 'معرفی', status: 'published', sourceUrl: 'https://x.ir/about/' })
    expect(page).not.toHaveProperty('excerpt')
    expect(page).not.toHaveProperty('bodyHtml')
    const back = docValues('pages', page)
    expect(back.excerpt).toBe('معرفی')
    expect(back.bodyHtml).toEqual(page.body)
  })

  it('quiz rows whose question was not imported are dropped', () => {
    const quiz = toDocData('quizzes', { questions: [{ question: { $ref: 'q1' }, points: 1 }, { question: { $ref: 'q2' }, points: 1 }] }, { resolve: (k) => (k === 'q1' ? 5 : null), dependsOn: [] })
    expect(quiz.questions).toEqual([{ question: 5, points: 1 }])
  })

  it('checksum of a doc ignores Payload array row ids and maps body back to bodyHtml', () => {
    const doc = { id: 3, title: 'x', instalments: [{ id: '66aa', index: 0, amount: 10 }], body: { root: { children: [] } } }
    expect(docValues('posts', doc).bodyHtml).toEqual(doc.body)
    const fields = ['instalments', 'title']
    expect(docChecksum('orders', doc, fields)).toBe(fieldsChecksum({ title: 'x', instalments: [{ index: 0, amount: 10 }] }, fields))
    // Same doc, new row ids (Payload regenerates them on update) → same checksum.
    expect(docChecksum('orders', { ...doc, instalments: [{ id: 'ffee', index: 0, amount: 10 }] }, fields)).toBe(docChecksum('orders', doc, fields))
  })

  it('progress is a set union and never decreases', () => {
    expect(unionIds([1, { id: 2 }], [2, 3])).toEqual([1, 2, 3])
    expect(unionIds(null, [4])).toEqual([4])
  })
})

// ---------------------------------------------------------------- nonce store

function memoryRepo(clock: { t: number }): NonceRepo & { rows: { c: number; n: string; exp: number; at: number }[] } {
  const rows: { c: number; n: string; exp: number; at: number }[] = []
  return {
    rows,
    async insert(c, n, exp) {
      const hit = rows.find((r) => r.c === c && r.n === n && r.exp > clock.t)
      if (hit) return 'duplicate'
      rows.push({ c, n, exp: exp.getTime(), at: clock.t })
      return 'ok'
    },
    async countSince(c, since) {
      return rows.filter((r) => r.c === c && r.at > since.getTime()).length
    },
    async purgeExpired(now) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.exp < now.getTime()) rows.splice(i, 1)
    },
  }
}

describe('nonce store (DB-backed replay guard, per connection)', () => {
  it('a nonce is accepted once per connection; another connection may reuse it', async () => {
    const clock = { t: Date.parse('2026-11-06T10:00:00Z') }
    const store = nonceStore(memoryRepo(clock), { now: () => new Date(clock.t) })
    expect(await store.seen(1)('cnx_a', 'n1')).toBe(false)
    expect(await store.seen(1)('cnx_a', 'n1')).toBe(true)
    expect(await store.seen(2)('cnx_b', 'n1')).toBe(false)
  })

  it('an expired nonce (after 10 min) is accepted again — the timestamp window refuses it anyway', async () => {
    const clock = { t: 0 }
    const store = nonceStore(memoryRepo(clock), { now: () => new Date(clock.t), ttlSeconds: 600 })
    expect(await store.seen(1)('c', 'n')).toBe(false)
    clock.t += 601_000
    expect(await store.seen(1)('c', 'n')).toBe(false)
  })

  it('rate limit: 60 requests per minute per connection, refused ones count too', async () => {
    const clock = { t: 1_000_000 }
    const repo = memoryRepo(clock)
    const store = nonceStore(repo, { now: () => new Date(clock.t), limit: 3 })
    await store.seen(1)('c', 'a')
    await store.recordRefused(1)
    expect(await store.rateLimited(1)).toBe(false)
    await store.seen(1)('c', 'b')
    expect(await store.rateLimited(1)).toBe(true)
    expect(await store.rateLimited(2)).toBe(false)
    clock.t += 61_000
    expect(await store.rateLimited(1)).toBe(false)
  })
})

// ---------------------------------------------------------------- SSRF guard

describe('media pull guard', () => {
  it('private, loopback, link-local, CGNAT and mapped addresses are refused', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '185.143.233.1', '172.32.0.1', '2a01:4f8::1']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('only the site hosts (or admin-approved ones), http(s), no credentials, no literal private IPs', () => {
    const hosts = allowedHosts(['https://academy.ir', 'https://academy.ir/wp-content/uploads'], ['cdn.academy.ir'])
    expect(checkMediaUrl('https://academy.ir/wp-content/uploads/a.jpg', hosts).ok).toBe(true)
    expect(checkMediaUrl('https://cdn.academy.ir/a.jpg', hosts).ok).toBe(true)
    expect(checkMediaUrl('https://evil.example/a.jpg', hosts)).toMatchObject({ ok: false, reason: 'host_not_allowed' })
    expect(checkMediaUrl('ftp://academy.ir/a.jpg', hosts)).toMatchObject({ ok: false, reason: 'scheme' })
    expect(checkMediaUrl('https://u:p@academy.ir/a.jpg', hosts)).toMatchObject({ ok: false, reason: 'credentials' })
    expect(checkMediaUrl('http://127.0.0.1/a.jpg', allowedHosts(['http://127.0.0.1']))).toMatchObject({ ok: false, reason: 'private_address' })
  })

  it('type by magic bytes: images and PDF in; SVG, HTML and video out', () => {
    expect(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg')
    expect(sniffMedia(Buffer.from('89504e470d0a1a0a0000', 'hex'))?.ext).toBe('png')
    expect(sniffMedia(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'))?.ext).toBe('webp')
    expect(sniffMedia(Buffer.from('%PDF-1.7'))?.ext).toBe('pdf')
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
    expect(sniffMedia(Buffer.from('<!doctype html><html>'))).toBeNull()
    expect(sniffMedia(Buffer.from('\u0000\u0000\u0000\u0018ftypmp42', 'latin1'))).toBeNull()
  })

  it('redirects are re-checked; HTML served as .jpg is refused', async () => {
    const hosts = allowedHosts(['https://academy.ir'])
    const body = (b: Buffer) => (async function* () {
      yield b
    })()
    const redirectOut = pullMedia('https://academy.ir/a.jpg', { hosts, get: async () => ({ status: 302, headers: { location: 'https://evil.example/a.jpg' }, body: body(Buffer.alloc(0)) }) })
    await expect(redirectOut).rejects.toMatchObject({ code: 'refused' })
    const html = pullMedia('https://academy.ir/a.jpg', { hosts, get: async () => ({ status: 200, headers: {}, body: body(Buffer.from('<html>')) }) })
    await expect(html).rejects.toBeInstanceOf(PullError)
    const ok = await pullMedia('https://academy.ir/a.jpg', { hosts, get: async () => ({ status: 200, headers: {}, body: body(Buffer.from([0xff, 0xd8, 0xff, 0xdb])) }) })
    expect(ok.kind.mime).toBe('image/jpeg')
  })
})

// ---------------------------------------------------------------- plugin zip

describe('plugin zip', () => {
  it('crc32 vector and a well-formed archive', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
    const zip = buildZip([{ name: 'edvora-migrator/readme.txt', data: Buffer.from('hello') }])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(1)
  })
})

// ---------------------------------------------------------------- held-user decisions (W8a)

describe('withPhoneOverrides (admin decisions before planning)', () => {
  it('injects the entered phone first and leaves skipped users out, keeping the manifest count consistent', async () => {
    const { MemorySource, makeRecord } = await import('@edvora/integrations/wordpress')
    const { withPhoneOverrides } = await import('./sources')
    const manifest = { format: 'edvora-wp-export', formatVersion: 1, pluginVersion: '1', createdAtGmt: 'x', connectionId: 'c', tenantSlug: 'demo', site: { siteId: 's', homeUrl: 'https://x.ir' }, counts: { 'wp.user': 3 } } as const
    const src = new MemorySource(manifest, [makeRecord('wp.user', 1, {}), makeRecord('wp.user', 2, {}, { meta: { mobile: 'x' } }), makeRecord('wp.user', 3, {})])
    const patched = withPhoneOverrides(src, { '2': '09120000099' }, ['3'])
    const page = await patched.read('wp.user', null, 10)
    expect(page.records.map((r) => r.wpId)).toEqual(['1', '2'])
    expect(page.records[1]?.meta).toMatchObject({ digits_phone: '09120000099', mobile: 'x' })
    expect((await patched.manifest()).counts['wp.user']).toBe(2)
  })
})
