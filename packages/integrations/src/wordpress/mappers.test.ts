import { describe, expect, it } from 'vitest'
import { ManifestSchema, makeRecord, type SourceRecord } from './format'
import { lifterlmsMapper } from './mappers/lifterlms'
import { tutorMapper } from './mappers/tutor'
import { classifyVideo, sanitiseWpHtml, slugFrom } from './mappers/util'
import { proposeProductCourseMap, woocommerceMapper } from './mappers/woocommerce'
import { postPermalinkPath, wpCoreMapper, wpRoles } from './mappers/wp-core'
import { MOCK_SITE_ID, MOCK_TENANT, mockManifest, mockRecords } from './mock'
import { buildMapContext } from './plan'
import type { EdvoraDraft, ImportWarning, MapperId } from './types'

const manifest = ManifestSchema.parse(mockManifest)
const R = (kind: string, wpId: string | number) => ({ $ref: `${MOCK_SITE_ID}:${kind}:${wpId}` })
const NOW = new Date('2026-11-06T00:00:00Z')

function run(mapperIds: MapperId[], records: readonly SourceRecord[] = mockRecords) {
  const warnings: ImportWarning[] = []
  const notImported: Record<string, number> = {}
  const { mapCtx, productCourseMap } = buildMapContext({ manifest, records, siteId: MOCK_SITE_ID, tenantSlug: MOCK_TENANT, mappers: mapperIds, now: NOW, warn: (w) => warnings.push(w), notImported })
  const mapper = { 'wp-core': wpCoreMapper, woocommerce: woocommerceMapper, lifterlms: lifterlmsMapper, tutor: tutorMapper }
  const drafts = mapperIds.flatMap((id) => mapper[id].map(mapCtx))
  const find = (collection: string, wpId: string) => drafts.find((d) => d.collection === collection && d.wpId === wpId) as EdvoraDraft
  return { drafts, warnings, notImported, productCourseMap, find, codes: (wpId: string | null) => warnings.filter((w) => w.wpId === wpId).map((w) => w.code) }
}

describe('wp-core mapper', () => {
  const r = run(['wp-core', 'woocommerce', 'lifterlms'])

  it('maps a Digits user (golden)', () => {
    expect(r.find('users', '2')).toEqual({
      collection: 'users',
      refKey: R('wp.user', 2).$ref,
      kind: 'wp.user',
      wpId: '2',
      mapper: 'wp-core',
      fields: {
        name: 'سارا کریمی',
        firstName: 'سارا',
        lastName: 'کریمی',
        contactEmail: 'sara@example.ir',
        city: 'تهران',
        roles: ['student'],
        source: 'import',
        nationalCode: '0499370899',
        phone: '09121234567',
      },
      dependsOn: [],
      precedence: 10,
      notes: ['phoneSource:digits_phone'],
    })
  })

  it('holds users without a phone or with a shared phone, drops invalid national codes', () => {
    expect(r.find('users', '6').hold?.reason).toBe('no_phone')
    expect(r.find('users', '7').hold?.reason).toBe('no_phone')
    expect(r.codes('7')).toEqual(['invalid_phone', 'no_phone'])
    expect(r.find('users', '4').hold).toEqual({ reason: 'duplicate_phone', detail: { phone: '09127778888', duplicateOf: ['5'] } })
    expect(r.find('users', '5').hold?.reason).toBe('duplicate_phone')
    expect(r.find('users', '3').fields.nationalCode).toBeUndefined()
    expect(r.find('users', '3').fields.phone).toBe('09351234567')
    expect(r.codes('3')).toContain('invalid_national_code')
    expect(r.find('users', '1').notes).toContain('wpRoles:administrator')
    expect(r.find('users', '1').fields.roles).toEqual(['student'])
  })

  it('maps media, skipping video', () => {
    expect(r.find('media', '50').fields).toEqual({ alt: 'کاور دوره برندسازی', filename: 'cover.jpg', mimeType: 'image/jpeg', sourceUrl: 'https://academy.example.ir/wp-content/uploads/2022/01/cover.jpg' })
    expect(r.find('media', '51').skip).toEqual({ reason: 'video_not_pulled' })
  })

  it('maps posts with sanitised HTML and redirects for the permalink and ?p=', () => {
    const p = r.find('posts', '60')
    expect(p.fields).toEqual({
      title: 'برندینگ چیست؟',
      slug: 'برندینگ-چیست',
      excerpt: 'خلاصه',
      bodyHtml: '<p>متن مقاله</p>',
      sourceUrl: 'https://academy.example.ir/%d8%a8%d8%b1%d9%86%d8%af%db%8c%d9%86%da%af-%da%86%db%8c%d8%b3%d8%aa/',
      author: 'مدیر سایت',
      publishedAt: '2022-01-01T09:00:00.000Z',
      cover: R('wp.attachment', 50),
    })
    const froms = r.drafts.filter((d) => d.collection === 'redirects' && (d.fields.target as { $ref: string }).$ref === p.refKey).map((d) => d.fields.from)
    expect(froms).toEqual(['/برندینگ-چیست', '/?p=60'])
    expect(r.find('pages', '61').fields.status).toBe('published')
    expect(r.codes('61')).toEqual(['page_builder'])
    expect(r.notImported['wp.post:trash']).toBe(1)
  })

  it('builds permalinks from structure tags', () => {
    const { mapCtx } = buildMapContext({ manifest: { ...manifest, site: { ...manifest.site, permalinkStructure: '/%year%/%monthnum%/%postname%/' } }, records: mockRecords, siteId: MOCK_SITE_ID, tenantSlug: MOCK_TENANT, mappers: ['wp-core'] })
    expect(postPermalinkPath(mapCtx, mockRecords.find((x) => x.wpId === '60' && x.kind === 'wp.post') as SourceRecord)).toBe('/2022/01/%d8%a8%d8%b1%d9%86%d8%af%db%8c%d9%86%da%af-%da%86%db%8c%d8%b3%d8%aa/')
  })

  it('reads roles in both capability encodings', () => {
    expect(wpRoles(makeRecord('wp.user', 1, {}, { meta: { wp_capabilities: 'json:{"editor":true,"x":false}' } }))).toEqual(['editor'])
    expect(wpRoles(makeRecord('wp.user', 1, {}, { meta: { wp_capabilities: ['subscriber'] } }))).toEqual(['subscriber'])
    expect(wpRoles(makeRecord('wp.user', 1, {}, { meta: { wp2_capabilities: 'json:["customer"]' } }))).toEqual(['customer'])
  })
})

describe('woocommerce mapper', () => {
  const r = run(['wp-core', 'woocommerce', 'lifterlms', 'tutor'])

  it('proposes product → course links', () => {
    expect(r.productCourseMap.map((l) => [l.productWpId, l.method, l.courseRefKey])).toEqual([
      ['100', 'title', R('lifterlms.course', 1100).$ref],
      ['101', 'tutor-meta', R('tutor.course', 2000).$ref],
      ['102', 'link-meta', R('lifterlms.course', 1101).$ref],
      ['103', 'unmapped', null],
    ])
    expect(r.productCourseMap.find((l) => l.productWpId === '103')?.usage).toBe(1)
  })

  it('honours admin overrides', () => {
    const { mapCtx } = buildMapContext({
      manifest,
      records: mockRecords,
      siteId: MOCK_SITE_ID,
      tenantSlug: MOCK_TENANT,
      mappers: ['wp-core', 'woocommerce', 'lifterlms'],
      overrides: { '103': 'skip', '100': { courseId: 77 }, '102': 'standalone' },
    })
    expect(mapCtx.product('103')?.method).toBe('skip')
    expect(mapCtx.product('100')).toMatchObject({ method: 'override', courseId: 77 })
    expect(mapCtx.product('102')).toMatchObject({ method: 'standalone', courseRefKey: R('woo.product', 102).$ref })
  })

  it('splits a two-course order into two Edvora orders (golden)', () => {
    expect(r.find('orders', '301#2')).toEqual({
      collection: 'orders',
      refKey: R('woo.order', '301#2').$ref,
      kind: 'woo.order',
      wpId: '301#2',
      mapper: 'woocommerce',
      fields: {
        user: R('wp.user', 3),
        course: R('lifterlms.course', 1100),
        subtotal: 84_700_000,
        discount: 250_000,
        total: 84_450_000,
        couponCode: 'FIXED50',
        status: 'paid',
        instalments: [{ index: 0, amount: 84_450_000, dueDate: '2022-05-01T12:00:00.000Z', status: 'paid', paidAt: '2022-05-01T12:03:10.000Z' }],
        payments: [
          { instalmentIndex: 0, provider: 'imported', gateway: 'WC_Gateway_Zibal', gatewayTitle: 'زیبال', authority: '9988', amount: 84_450_000, status: 'verified', refId: 'Z-1' },
        ],
        source: 'import',
        createdAt: '2022-05-01T12:00:00.000Z',
      },
      dependsOn: [R('wp.user', 3).$ref, R('lifterlms.course', 1100).$ref],
      precedence: 10,
      notes: ['wpStatus:wc-processing', 'wpUserVia:customer'],
    })
    expect(r.find('orders', '301#3').fields.course).toEqual(R('tutor.course', 2000))
  })

  it('maps statuses, gateways, guests and currency errors', () => {
    expect(r.find('orders', '300#1').fields.payments).toMatchObject([{ gateway: 'WC_ZPal', authority: 'A00000000000000000000000000123456789', refId: 'A00000000000000000000000000123456789' }])
    expect(r.find('orders', '302#5').fields.status).toBe('refunded')
    expect(r.find('orders', '304#7').fields.user).toEqual(R('wp.user', 3))
    expect(r.find('orders', '304#7').notes).toContain('wpUserVia:billing_phone')
    expect(r.find('orders', '305#8').hold).toEqual({ reason: 'unmapped_product', detail: { productWpId: '103' } })
    expect(r.find('orders', '308#11')).toBeUndefined()
    expect(r.codes('308')).toEqual(['currency_invalid'])
    expect(r.notImported['woo.order:wc-pending']).toBe(1)
    expect(r.notImported['woo.order:wc-cancelled']).toBe(1)
    expect(r.drafts.filter((d) => d.collection === 'orders' && d.wpId.startsWith('303'))).toEqual([])
  })

  it('patches LMS course prices from the Woo product (Woo wins) and keeps sale price out', () => {
    const patch = r.drafts.find((d) => d.collection === 'courses' && d.kind === 'woo.product' && d.wpId === '100')
    expect(patch).toMatchObject({ refKey: R('lifterlms.course', 1100).$ref, fields: { price: 84_700_000 }, precedence: 20, patchOnly: true })
    expect(r.codes('101')).toContain('sale_price_ignored')
    expect(r.codes('102')).toEqual(['price_invalid']) // 1234.56 IRT → fractional rial
    expect(r.drafts.find((d) => d.kind === 'woo.product' && d.wpId === '102' && d.collection === 'courses')).toBeUndefined()
    expect(r.warnings.find((w) => w.wpId === '103')).toMatchObject({ code: 'unmapped_product', severity: 'blocking' })
  })

  it('maps coupons in rials and refuses bad ones', () => {
    expect(r.find('coupons', '200').fields).toEqual({ code: 'NOROOZ', kind: 'percent', value: 20, validUntil: '2030-01-01T00:00:00.000Z', usageLimit: 100, usedCount: 3, active: true, note: undefined })
    expect(r.find('coupons', '201').fields).toMatchObject({ code: 'FIXED50', kind: 'fixed', value: 500_000, active: false })
    expect(r.codes('201')).toEqual(['coupon_restrictions_dropped'])
    expect(r.find('coupons', '202').skip).toEqual({ reason: 'coupon_invalid' })
  })

  it('turns memberships into enrollments through plan products', () => {
    const e = r.drafts.find((d) => d.collection === 'enrollments' && d.wpId === `4>lifterlms.course:1100`)
    expect(e).toMatchObject({ precedence: 5, fields: { user: R('wp.user', 4), course: R('lifterlms.course', 1100), status: 'active', enrolledAt: '2022-06-01T00:00:00.000Z' } })
    const expired = r.drafts.find((d) => d.collection === 'enrollments' && d.wpId === `3>lifterlms.course:1100` && d.mapper === 'woocommerce')
    expect(expired?.fields.status).toBe('cancelled')
    expect(expired?.notes).toContain('accessEndsAt:2022-06-01T00:00:00.000Z')
  })

  it('creates courses and enrollments from products on a Woo-only site', () => {
    const woo = run(['wp-core', 'woocommerce'])
    expect(woo.productCourseMap.every((l) => l.method === 'standalone')).toBe(true)
    expect(woo.find('courses', '100').fields).toMatchObject({ title: 'دوره برندسازی', slug: 'دوره-برندسازی', price: 84_700_000, status: 'draft', heroImage: R('wp.attachment', 50) })
    expect(woo.find('courses', '102').fields.price).toBeNull()
    const e = woo.drafts.find((d) => d.collection === 'enrollments' && d.wpId === `2>woo.product:100` && d.precedence === 6)
    expect(e?.fields).toMatchObject({ status: 'active', order: R('woo.order', '300#1') })
    expect(woo.drafts.some((d) => d.collection === 'enrollments' && d.wpId.startsWith('2>woo.product:101'))).toBe(false) // refunded
  })

  it('suggests similar titles without linking them', () => {
    const records = [
      makeRecord('woo.product', 9, { post_title: 'دوره‌ی برند (آنلاین)', post_status: 'publish' }),
      makeRecord('lifterlms.course', 8, { post_title: 'دوره‌ی برند' }),
    ]
    const links = proposeProductCourseMap(buildMapContext({ manifest, records, siteId: 's', tenantSlug: 't', mappers: ['lifterlms'] }).index, { siteId: 's', mappers: ['lifterlms'] })
    expect(links[0]).toMatchObject({ method: 'unmapped', hint: 'similar', candidates: [{ refKey: 's:lifterlms.course:8', title: 'دوره‌ی برند' }] })
  })
})

describe('lifterlms mapper', () => {
  const r = run(['wp-core', 'woocommerce', 'lifterlms'])

  it('orders lessons densely by section then lesson order, module = section title', () => {
    const lessons = r.drafts.filter((d) => d.collection === 'lessons' && (d.fields.course as { $ref: string }).$ref === R('lifterlms.course', 1100).$ref)
    expect(lessons.map((l) => [l.wpId, l.fields.order, l.fields.module])).toEqual([
      ['1202', 1, 'فصل اول'],
      ['1201', 2, 'فصل اول'],
      ['1200', 3, 'فصل دوم'],
      ['1203', 4, 'فصل دوم'],
    ])
  })

  it('maps a lesson (golden) and stubs DRM players', () => {
    expect(r.find('lessons', '1201')).toEqual({
      collection: 'lessons',
      refKey: R('lifterlms.lesson', 1201).$ref,
      kind: 'lifterlms.lesson',
      wpId: '1201',
      mapper: 'lifterlms',
      fields: {
        course: R('lifterlms.course', 1100),
        title: 'جلسه دوم',
        module: 'فصل اول',
        order: 2,
        durationMinutes: undefined,
        isFreePreview: false,
        videoUrl: undefined,
        videoStatus: undefined,
        notes: undefined,
        drip: { mode: 'afterEnrollment', days: 7 },
      },
      dependsOn: [R('lifterlms.course', 1100).$ref],
      precedence: 10,
    })
    expect(r.find('lessons', '1203').fields).toMatchObject({ videoStatus: 'needs-action', videoUrl: undefined })
    expect(r.find('lessons', '1204').fields).toMatchObject({ videoStatus: 'needs-action' })
    expect(r.find('lessons', '1202').fields).toMatchObject({ isFreePreview: true, videoStatus: 'external', videoUrl: 'https://www.youtube.com/watch?v=abc' })
    expect(r.codes('1203')).toEqual(['video_needs_action'])
  })

  it('prices courses from access plans and flags placeholders', () => {
    expect(r.find('courses', '1101').fields.price).toBe(7_770_000)
    expect(r.find('courses', '1100').fields.price).toBe(1) // plan "1" IRR; the Woo patch (precedence 20) wins in the plan
    expect(r.codes('1302')).toEqual(['price_suspicious'])
    expect(r.codes('1300')).toEqual([]) // linked to a Woo product: no placeholder warning
    expect(r.codes('1102')).toEqual(['course_empty'])
  })

  it('maps supported questions only (golden single choice)', () => {
    expect(r.find('questions', '1500').fields).toEqual({
      course: R('lifterlms.course', 1100),
      type: 'single',
      points: 2,
      text: 'برند چیست؟',
      options: [
        { text: 'هویت', isCorrect: true },
        { text: 'لوگو', isCorrect: false },
      ],
      correctAnswer: undefined,
      acceptedAnswers: undefined,
      explanation: undefined,
      archived: false,
    })
    expect(r.find('questions', '1501').fields.type).toBe('multiple')
    expect(r.find('questions', '1502').fields).toMatchObject({ type: 'trueFalse', correctAnswer: 'false' })
    expect(r.find('questions', '1503')).toBeUndefined()
    expect(r.find('questions', '1504')).toBeUndefined()
    expect(r.codes('1503')).toEqual(['question_type_unsupported'])
    const quiz = r.find('quizzes', '1400')
    expect(quiz.fields).toMatchObject({ lesson: R('lifterlms.lesson', 1200), passMark: 70, attemptsLimit: 3, required: true, status: 'draft' })
    expect((quiz.fields.questions as unknown[]).length).toBe(3)
    expect(r.codes('1400')).toEqual(['quiz_incomplete'])
  })

  it('builds enrollments + progress from lifterlms_user_postmeta', () => {
    const sara = r.drafts.find((d) => d.collection === 'enrollments' && d.wpId === '2>lifterlms.course:1100' && d.mapper === 'lifterlms')
    expect(sara?.fields).toEqual({
      user: R('wp.user', 2),
      course: R('lifterlms.course', 1100),
      status: 'active',
      enrolledAt: '2022-05-01T13:00:00.000Z',
      completedLessons: [R('lifterlms.lesson', 1201), R('lifterlms.lesson', 1202)],
    })
    expect(sara?.unionFields).toEqual(['completedLessons'])
    const ali = r.drafts.find((d) => d.collection === 'enrollments' && d.wpId === '3>lifterlms.course:1100' && d.mapper === 'lifterlms')
    expect(ali?.fields.status).toBe('cancelled') // latest _status row wins
    expect(r.notImported['lifterlms.progress:no_enrollment']).toBe(1)
    expect(r.notImported['lifterlms.order']).toBe(1)
  })

  it('maps earned certificates with the legacy id', () => {
    expect(r.find('certificates', '1600').fields).toEqual({
      holderName: 'سارا کریمی',
      user: R('wp.user', 2),
      course: R('lifterlms.course', 1100),
      issuedAt: '2023-03-01T10:00:00.000Z',
      status: 'valid',
      legacyId: '1600',
      legacyCode: '12',
      legacyUrl: 'https://academy.example.ir/?post_type=llms_my_certificate&p=1600',
    })
  })
})

describe('tutor mapper', () => {
  const r = run(['wp-core', 'woocommerce', 'tutor'])

  it('maps topics → modules, video sources and runtime', () => {
    expect(r.find('lessons', '2200').fields).toMatchObject({
      module: 'مقدمه',
      order: 1,
      durationMinutes: 13,
      isFreePreview: true,
      videoUrl: 'https://academy.example.ir/wp-content/uploads/2022/01/intro.mp4',
      videoStatus: 'transfer',
    })
    expect(r.find('lessons', '2201').fields).toMatchObject({ order: 2, videoUrl: 'https://youtu.be/xyz', videoStatus: 'external' })
    expect(r.find('courses', '2000').fields.price).toBeNull() // Woo product 101 sets it
  })

  it('maps questions, quiz options, enrollments and progress', () => {
    expect(r.find('questions', '2401').fields).toMatchObject({ type: 'trueFalse', correctAnswer: 'true' })
    expect(r.find('questions', '2403').fields).toMatchObject({ type: 'short', acceptedAnswers: [{ answer: 'برند' }] })
    expect(r.find('questions', '2402')).toBeUndefined()
    expect(r.find('quizzes', '2300').fields).toMatchObject({ passMark: 80, attemptsLimit: 3, timeLimitMin: 10, lesson: undefined })
    const e = r.drafts.find((d) => d.collection === 'enrollments' && d.mapper === 'tutor')
    expect(e?.fields).toEqual({ user: R('wp.user', 8), course: R('tutor.course', 2000), status: 'active', enrolledAt: '2023-02-01T08:00:00.000Z', completedLessons: [R('tutor.lesson', 2200)] })
    expect(r.notImported['tutor.enrollment:pending']).toBe(1)
  })
})

describe('mapper helpers', () => {
  it('sanitises HTML and collects shortcodes', () => {
    expect(sanitiseWpHtml('<p onclick="x">a</p><script>b</script><iframe src="https://evil.example/x"></iframe><iframe src="https://www.aparat.com/video/1"></iframe>[x_btn a="1"]بله[/x_btn]<a href="javascript:alert(1)">l</a>')).toEqual({
      html: '<p>a</p><iframe src="https://www.aparat.com/video/1"></iframe>بله<a href="#">l</a>',
      shortcodes: ['x_btn'],
    })
    expect(sanitiseWpHtml('')).toEqual({ html: null, shortcodes: [] })
  })
  it('classifies video sources', () => {
    expect(classifyVideo(null, '[spotplayer id=1]').videoStatus).toBe('needs-action')
    expect(classifyVideo('https://aparat.com/v/x', null)).toMatchObject({ videoStatus: 'external', provider: 'aparat' })
    expect(classifyVideo('https://x.ir/a.mp4', null).videoStatus).toBe('transfer')
    expect(classifyVideo('https://unknown-player.ir/embed/1', null).videoStatus).toBe('needs-action')
    expect(classifyVideo(null, null).videoStatus).toBe('none')
  })
  it('decodes slugs', () => {
    expect(slugFrom('%d8%a8%d8%b1%d9%86%d8%af', null, '1')).toBe('برند')
    expect(slugFrom(null, 'دوره برندسازي ۱', '1')).toBe('دوره-برندسازی-۱')
    expect(slugFrom(null, null, '7')).toBe('wp-7')
  })
})
