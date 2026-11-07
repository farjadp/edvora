/**
 * WooCommerce (+ Woo Memberships): products → courses (Woo-only sites) or price patches on LMS courses,
 * orders → one Edvora order per course line item, coupons, memberships → enrollments.
 */
import { toPersianDigits as fa } from '@edvora/core/digits'
import { normalizeIranMobile } from '@edvora/core/phone'
import { titleMatchKey } from '@edvora/core/wpimport'
import type { Manifest, SourceRecord } from '../format'
import type {
  DraftId,
  DraftRef,
  EdvoraDraft,
  MapContext,
  MapperId,
  ProductCourseLink,
  ProductCourseOverride,
  SourceIndex,
  StackMapper,
} from '../types'
import { redirectDraft } from './wp-core'
import { enrollmentWpId, mediaRef, meta, metaDate, metaIds, metaNum, parseRefKey, rialOf, slugFrom, sourceUrl, str, stripTags, text, wpDate } from './util'

export const hasPlugin = (m: Manifest, slug: string) => m.plugins.some((p) => p.slug === slug && p.active !== false)

/** Woo order status → Edvora order status; anything else is skipped and counted. */
export const WOO_ORDER_STATUS: Readonly<Record<string, 'paid' | 'refunded'>> = {
  'wc-completed': 'paid',
  'wc-processing': 'paid',
  'wc-refunded': 'refunded',
}

const GATEWAY_AUTHORITY_META = ['_zarinpal_authority', '_zibal_track_id', 'authority', '_idpay_id', '_payping_code']

const LMS_COURSE_KINDS: Readonly<Record<string, MapperId>> = { 'lifterlms.course': 'lifterlms', 'tutor.course': 'tutor' }
/** Product meta keys that may point to an LMS course; only accepted when the id is an exported course. */
const LINK_META = /(^|_)courses?(_ids?)?$/i

type CourseCandidate = { refKey: string; title: string; record: SourceRecord }

function lmsCourses(index: SourceIndex, siteId: string, mappers: readonly MapperId[]): CourseCandidate[] {
  const out: CourseCandidate[] = []
  for (const [kind, mapper] of Object.entries(LMS_COURSE_KINDS)) {
    if (!mappers.includes(mapper)) continue
    for (const r of index.all(kind)) out.push({ refKey: `${siteId}:${kind}:${r.wpId}`, title: text(str(r, 'post_title')) ?? '', record: r })
  }
  return out
}

function productUsage(index: SourceIndex): Map<string, number> {
  const usage = new Map<string, number>()
  const add = (id: string | null) => {
    if (id && id !== '0') usage.set(id, (usage.get(id) ?? 0) + 1)
  }
  for (const o of index.all('woo.order')) {
    if (!WOO_ORDER_STATUS[str(o, 'status') ?? '']) continue
    for (const item of o.items ?? []) if (item.type === 'line_item' || item.type === undefined) add(String(item.product_id ?? ''))
  }
  const plans = new Map(index.all('woo.membership_plan').map((p) => [p.wpId, metaIds(p, '_product_ids')]))
  for (const m of index.all('woo.membership')) for (const pid of plans.get(str(m, 'post_parent') ?? '') ?? []) add(pid)
  return usage
}

/**
 * Proposes product → course links: admin override › Tutor `_tutor_course_product_id` › product link meta
 * pointing at an exported LMS course › exact normalised title › standalone (no LMS) / unmapped.
 */
export function proposeProductCourseMap(
  index: SourceIndex,
  opts: { siteId: string; mappers: readonly MapperId[]; overrides?: Record<string, ProductCourseOverride> },
): ProductCourseLink[] {
  const courses = lmsCourses(index, opts.siteId, opts.mappers)
  const lmsActive = opts.mappers.includes('lifterlms') || opts.mappers.includes('tutor')
  const byRef = new Map(courses.map((c) => [c.refKey, c]))
  const byWpId = new Map(courses.map((c) => [c.record.wpId, c]))
  const byTitle = new Map<string, CourseCandidate[]>()
  for (const c of courses) {
    const k = titleMatchKey(c.title)
    if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), c])
  }
  const tutorLinks = new Map<string, CourseCandidate>()
  for (const c of courses) {
    const pid = c.record.kind === 'tutor.course' ? meta(c.record, '_tutor_course_product_id') : null
    if (pid && pid !== '0') tutorLinks.set(pid, c)
  }
  const usage = productUsage(index)
  return index.all('woo.product').map((p): ProductCourseLink => {
    const productTitle = text(str(p, 'post_title')) ?? `#${p.wpId}`
    const base = { productWpId: p.wpId, productTitle, courseRefKey: null, courseId: null, courseTitle: null, candidates: [], hint: null, usage: usage.get(p.wpId) ?? 0 }
    const link = (c: CourseCandidate, method: ProductCourseLink['method']): ProductCourseLink => ({ ...base, method, courseRefKey: c.refKey, courseTitle: c.title })
    const o = opts.overrides?.[p.wpId]
    if (o === 'skip') return { ...base, method: 'skip' }
    if (o === 'standalone') return { ...base, method: 'standalone', courseRefKey: `${opts.siteId}:woo.product:${p.wpId}`, courseTitle: productTitle }
    if (o && 'courseId' in o) return { ...base, method: 'override', courseId: o.courseId }
    if (o && 'course' in o) {
      const c = byRef.get(o.course)
      if (c) return link(c, 'override')
    }
    const tutor = tutorLinks.get(p.wpId)
    if (tutor) return link(tutor, 'tutor-meta')
    for (const key of Object.keys(p.meta ?? {})) {
      if (!LINK_META.test(key)) continue
      const hit = metaIds(p, key).map((id) => byWpId.get(id)).find(Boolean)
      if (hit) return link(hit, 'link-meta')
    }
    const titled = byTitle.get(titleMatchKey(productTitle)) ?? []
    if (titled.length === 1 && titled[0]) return link(titled[0], 'title')
    if (!lmsActive) return { ...base, method: 'standalone', courseRefKey: `${opts.siteId}:woo.product:${p.wpId}`, courseTitle: productTitle }
    if (titled.length > 1) return { ...base, method: 'unmapped', hint: 'ambiguous', candidates: titled.map((c) => ({ refKey: c.refKey, title: c.title })) }
    // Suggestions only (never auto-linked): "X (آنلاین)" vs "X", or one title containing the other.
    const bare = titleMatchKey(productTitle.replace(/[(（][^)）]*[)）]/g, ''))
    const similar = courses.filter((c) => {
      const k = titleMatchKey(c.title)
      return k !== '' && bare !== '' && (k === bare || k.includes(bare) || bare.includes(k))
    })
    return { ...base, method: 'unmapped', hint: similar.length ? 'similar' : null, candidates: similar.map((c) => ({ refKey: c.refKey, title: c.title })) }
  })
}

function courseRelation(link: ProductCourseLink | undefined): DraftRef | DraftId | null {
  if (!link) return null
  if (link.courseId !== null) return { $id: link.courseId }
  return link.courseRefKey ? { $ref: link.courseRefKey } : null
}

function productPrice(ctx: MapContext, p: SourceRecord): number | null {
  const currency = ctx.manifest.woo?.currency ?? null
  const raw = meta(p, '_regular_price') ?? meta(p, '_price')
  const title = text(str(p, 'post_title')) ?? p.wpId
  if (raw === null) {
    ctx.warn({ code: 'price_missing', severity: 'warn', kind: p.kind, wpId: p.wpId, message: `محصول «${title}» قیمت ندارد؛ قیمت دوره خالی می‌ماند (TODO: از آکادمی بپرسید).` })
    return null
  }
  const r = rialOf(raw, currency)
  if (!r.ok) {
    ctx.warn({ code: 'price_invalid', severity: 'warn', kind: p.kind, wpId: p.wpId, message: `قیمت «${raw}» برای «${title}» به ریال تبدیل نشد (${r.code})؛ قیمت دوره خالی می‌ماند.`, detail: { amount: raw, currency, error: r.code } })
    return null
  }
  if (meta(p, '_sale_price')) {
    ctx.warn({ code: 'sale_price_ignored', severity: 'info', kind: p.kind, wpId: p.wpId, message: `«${title}» قیمت حراج دارد؛ قیمت عادی به‌عنوان قیمت دوره وارد شد.`, detail: { salePrice: meta(p, '_sale_price') } })
  }
  return r.value
}

function mapProducts(ctx: MapContext, drafts: EdvoraDraft[]): void {
  for (const p of ctx.index.all('woo.product')) {
    const status = str(p, 'post_status') ?? 'publish'
    if (status === 'trash' || status === 'auto-draft') continue
    const link = ctx.product(p.wpId)
    if (!link || link.method === 'skip') continue
    const title = text(str(p, 'post_title')) ?? `#${p.wpId}`
    const productSlug = str(p, 'post_name')
    if (link.method === 'unmapped') {
      if (link.usage > 0) {
        ctx.warn({
          code: link.hint === 'ambiguous' ? 'ambiguous_product' : 'unmapped_product',
          severity: 'blocking',
          kind: p.kind,
          wpId: p.wpId,
          message: `محصول «${title}» به هیچ دوره‌ای وصل نیست و ${fa(link.usage)} سفارش یا عضویت به آن وابسته است؛ در جدول «محصول ← دوره» آن را مشخص کنید.${link.candidates.length ? ` پیشنهاد: ${link.candidates.map((c) => `«${c.title}»`).join('، ')}.` : ''}`,
          detail: { usage: link.usage, candidates: link.candidates },
        })
      } else ctx.notImported('woo.product:unmapped')
      continue
    }
    if (link.method === 'override' && link.courseId !== null) continue
    if (!link.courseRefKey) continue
    const price = productPrice(ctx, p)
    if (link.method === 'standalone') {
      const slug = slugFrom(productSlug, title, p.wpId)
      drafts.push({
        collection: 'courses',
        refKey: link.courseRefKey,
        kind: p.kind,
        wpId: p.wpId,
        mapper: 'woocommerce',
        fields: {
          title,
          slug,
          summary: stripTags(str(p, 'post_excerpt')) ?? undefined,
          heroImage: mediaRef(ctx, meta(p, '_thumbnail_id')),
          price,
          maxInstalments: 1,
          status: 'draft',
          sourceUrl: sourceUrl(ctx, `product/${slug}`),
        },
        dependsOn: [],
        precedence: 20,
        notes: [`wpStatus:${status}`],
      })
      if (productSlug) drafts.push(redirectDraft(ctx, `/product/${productSlug}`, ctx.paths.course(slug), link.courseRefKey, 'woocommerce'))
      continue
    }
    // Linked to an LMS course: Woo price wins (ADR 011), and the product URL redirects to that course.
    if (price !== null) {
      drafts.push({ collection: 'courses', refKey: link.courseRefKey, kind: p.kind, wpId: p.wpId, mapper: 'woocommerce', fields: { price }, dependsOn: [], precedence: 20, patchOnly: true })
    }
    const parsed = parseRefKey(link.courseRefKey)
    const course = parsed ? ctx.index.get(parsed.kind, parsed.wpId) : undefined
    if (productSlug && course) {
      const courseSlug = slugFrom(str(course, 'post_name'), text(str(course, 'post_title')), course.wpId)
      drafts.push(redirectDraft(ctx, `/product/${productSlug}`, ctx.paths.course(courseSlug), link.courseRefKey, 'woocommerce'))
    }
  }
}

function mapCoupons(ctx: MapContext, drafts: EdvoraDraft[]): void {
  const currency = ctx.manifest.woo?.currency ?? null
  for (const c of ctx.index.all('woo.coupon')) {
    const code = str(c, 'post_title')?.trim().toUpperCase() ?? null
    const status = str(c, 'post_status') ?? 'publish'
    if (!code || status === 'trash') continue
    const type = meta(c, 'discount_type') ?? 'fixed_cart'
    const amount = meta(c, 'coupon_amount') ?? '0'
    const draft: EdvoraDraft = { collection: 'coupons', refKey: ctx.refKey(c.kind, c.wpId), kind: c.kind, wpId: c.wpId, mapper: 'woocommerce', fields: { code }, dependsOn: [], precedence: 10 }
    if (type === 'percent') {
      const value = Number(amount)
      if (!Number.isFinite(value) || value < 0 || value > 100) draft.skip = { reason: 'coupon_invalid' }
      else Object.assign(draft.fields, { kind: 'percent', value })
    } else {
      const r = rialOf(amount, currency)
      if (!r.ok) draft.skip = { reason: 'coupon_invalid' }
      else Object.assign(draft.fields, { kind: 'fixed', value: r.value })
    }
    if (draft.skip) {
      ctx.warn({ code: 'coupon_invalid', severity: 'warn', kind: c.kind, wpId: c.wpId, message: `کد تخفیف ${code} مقدار نامعتبر دارد (${amount}) و وارد نمی‌شود.`, detail: { type, amount, currency } })
    }
    const validUntil = metaDate(ctx, c, 'date_expires')
    const usageLimit = metaNum(c, 'usage_limit')
    const expired = validUntil !== null && Date.parse(validUntil) < ctx.now.getTime()
    Object.assign(draft.fields, {
      validUntil: validUntil ?? undefined,
      usageLimit: usageLimit && usageLimit > 0 ? usageLimit : undefined,
      usedCount: metaNum(c, 'usage_count') ?? 0,
      active: status === 'publish' && !expired,
      note: text(str(c, 'post_excerpt')) ?? undefined,
    })
    const restricted = ['product_ids', 'exclude_product_ids', 'product_categories', 'customer_email', 'minimum_amount', 'maximum_amount'].filter((k) => {
      const v = meta(c, k)
      return v !== null && v !== '0' && v !== 'json:[]' && v !== 'a:0:{}'
    })
    if (restricted.length && !draft.skip) {
      ctx.warn({ code: 'coupon_restrictions_dropped', severity: 'info', kind: c.kind, wpId: c.wpId, message: `محدودیت‌های کد تخفیف ${code} (${restricted.join('، ')}) در ادوورا پشتیبانی نمی‌شود و حذف شد.`, detail: { restricted } })
    }
    drafts.push(draft)
  }
}

type OrderUser = { wpId: string; via: 'customer' | 'billing_phone' }

function orderUser(ctx: MapContext, o: SourceRecord): OrderUser | null {
  const customer = str(o, 'customer_id')
  if (customer && customer !== '0' && ctx.index.get('wp.user', customer)) return { wpId: customer, via: 'customer' }
  const phone = normalizeIranMobile(str(o, 'billing_phone') ?? meta(o, '_billing_phone') ?? '')
  const byPhone = phone ? ctx.userByPhone(phone) : undefined
  return byPhone ? { wpId: byPhone, via: 'billing_phone' } : null
}

function paymentAuthority(o: SourceRecord): string {
  for (const key of GATEWAY_AUTHORITY_META) {
    const v = meta(o, key)
    if (v) return v
  }
  return str(o, 'transaction_id') ?? `wp-order-${o.wpId}`
}

function mapOrders(ctx: MapContext, drafts: EdvoraDraft[]): void {
  const skippedStatus = new Map<string, number>()
  let orphans = 0
  // Refund rows (`shop_order_refund`, negative total, parent_id set) fold into their parent order.
  const refunds = new Map<string, string[]>()
  for (const o of ctx.index.all('woo.order')) {
    if ((str(o, 'type') ?? 'shop_order') !== 'shop_order_refund') continue
    const parent = str(o, 'parent_id')
    if (parent && parent !== '0') refunds.set(parent, [...(refunds.get(parent) ?? []), (str(o, 'total') ?? '0').replace(/^-/, '')])
    ctx.notImported('woo.order:refund_folded')
  }
  for (const o of ctx.index.all('woo.order')) {
    const wooStatus = str(o, 'status') ?? 'unknown'
    const type = str(o, 'type') ?? 'shop_order'
    if (type === 'shop_order_refund') continue
    if (type !== 'shop_order') {
      ctx.notImported(`woo.order:${type}`)
      continue
    }
    let status = WOO_ORDER_STATUS[wooStatus]
    if (!status) {
      skippedStatus.set(wooStatus, (skippedStatus.get(wooStatus) ?? 0) + 1)
      continue
    }
    const user = orderUser(ctx, o)
    if (!user) {
      orphans++
      continue
    }
    const currency = str(o, 'currency') ?? ctx.manifest.woo?.currency ?? null
    const lines = (o.items ?? []).filter((i) => (i.type ?? 'line_item') === 'line_item')
    const couponCode = (o.items ?? []).find((i) => i.type === 'coupon' && typeof i.code === 'string')?.code
    const createdAt = wpDate(ctx, o, 'date_created_gmt') ?? undefined
    const paidAt = wpDate(ctx, o, 'date_paid_gmt') ?? wpDate(ctx, o, 'date_completed_gmt') ?? createdAt
    const userRef = ctx.ref('wp.user', user.wpId)
    const prepared: { line: Record<string, unknown>; subtotal: number; total: number }[] = []
    let moneyError: string | null = null
    for (const line of lines) {
      const asText = (v: unknown) => (v === null || v === undefined ? null : String(v))
      const totalRaw = asText(line.total) ?? (lines.length === 1 ? str(o, 'total') : null)
      const subtotalRaw = asText(line.subtotal) ?? totalRaw
      const total = rialOf(totalRaw, currency)
      const subtotal = rialOf(subtotalRaw, currency)
      if (!total.ok || !subtotal.ok) {
        moneyError = !total.ok ? total.code : subtotal.ok ? 'invalid_amount' : subtotal.code
        break
      }
      prepared.push({ line, subtotal: subtotal.value, total: total.value })
    }
    if (moneyError) {
      ctx.warn({ code: 'currency_invalid', severity: 'warn', kind: o.kind, wpId: o.wpId, message: `مبلغ سفارش #${o.wpId} به ریال تبدیل نشد (${moneyError})؛ سفارش وارد نمی‌شود.`, detail: { currency, total: str(o, 'total'), error: moneyError } })
      continue
    }
    let refunded = 0
    for (const amount of refunds.get(o.wpId) ?? []) {
      const r = rialOf(amount, currency)
      if (r.ok) refunded += r.value
    }
    const orderTotal = rialOf(str(o, 'total'), currency)
    if (refunded > 0 && status === 'paid') {
      if (orderTotal.ok && refunded >= orderTotal.value) status = 'refunded'
      else {
        ctx.warn({ code: 'order_partial_refund', severity: 'warn', kind: o.kind, wpId: o.wpId, message: `سفارش #${o.wpId} بخشی مسترد شده (${fa(refunded.toLocaleString('en-US'))} ریال)؛ استرداد جزئی در ادوورا نمایش داده نمی‌شود و سفارش پرداخت‌شده می‌ماند.`, detail: { refundedRial: refunded } })
      }
    }
    const fees = (o.items ?? []).filter((i) => i.type === 'fee').length
    const tax = Number(str(o, 'tax_total') ?? 0)
    if (fees > 0 || tax > 0) {
      ctx.warn({ code: 'order_fees_dropped', severity: 'info', kind: o.kind, wpId: o.wpId, message: `هزینه‌های جانبی یا مالیات سفارش #${o.wpId} به سفارش‌های ادوورا منتقل نمی‌شود.`, detail: { fees, tax } })
    }
    for (const { line, subtotal, total } of prepared) {
      const lineId = String(line.id ?? '')
      const productId = String(line.product_id ?? '')
      const link = ctx.product(productId)
      if (link?.method === 'skip') {
        ctx.notImported('woo.order_line:not_a_course')
        continue
      }
      const course = courseRelation(link)
      const wpId = `${o.wpId}#${lineId}`
      const refKey = ctx.refKey(o.kind, wpId)
      const fields: Record<string, unknown> = {
        user: userRef,
        course: course ?? undefined,
        subtotal,
        discount: subtotal - total,
        total,
        couponCode: typeof couponCode === 'string' ? couponCode.toUpperCase() : undefined,
        status,
        instalments: [{ index: 0, amount: total, dueDate: createdAt, status: 'paid', paidAt }],
        payments: [
          {
            instalmentIndex: 0,
            provider: 'imported',
            gateway: str(o, 'payment_method') ?? undefined,
            gatewayTitle: text(str(o, 'payment_method_title')) ?? undefined,
            authority: paymentAuthority(o),
            amount: total,
            status: 'verified',
            refId: str(o, 'transaction_id') ?? undefined,
          },
        ],
        source: 'import',
        createdAt,
      }
      const dependsOn = [userRef.$ref, ...(course && '$ref' in course ? [course.$ref] : [])]
      const notes = [`wpStatus:${wooStatus}`, `wpUserVia:${user.via}`, ...(refunded ? [`refundedRial:${refunded}`] : [])]
      const draft: EdvoraDraft = { collection: 'orders', refKey, kind: o.kind, wpId, mapper: 'woocommerce', fields, dependsOn, precedence: 10, notes }
      if (!course) draft.hold = { reason: 'unmapped_product', detail: { productWpId: productId } }
      drafts.push(draft)
      // Woo-only sites: a paid order line is the enrollment (LMS sites take enrollments from the LMS).
      if (!ctx.lmsActive && course && status === 'paid') {
        drafts.push(enrollmentDraft(ctx, user.wpId, course, { status: 'active', enrolledAt: paidAt, order: { $ref: refKey } }, 6, `order:${o.wpId}`))
      }
    }
  }
  for (const [s, n] of skippedStatus) {
    ctx.notImported(`woo.order:${s}`, n)
    ctx.warn({ code: 'order_status_skipped', severity: 'info', kind: 'woo.order', wpId: null, message: `${fa(n)} سفارش با وضعیت ${s} وارد نمی‌شود (فقط تکمیل‌شده، در حال انجام و مسترد).`, detail: { status: s, count: n } })
  }
  if (orphans) {
    ctx.notImported('woo.order:orphan', orphans)
    ctx.warn({ code: 'orphan_order', severity: 'warn', kind: 'woo.order', wpId: null, message: `${fa(orphans)} سفارش کاربر مشخصی ندارد (مهمان یا کاربر حذف‌شده، بدون شمارهٔ قابل تطبیق) و وارد نمی‌شود.`, detail: { count: orphans } })
  }
}

export function enrollmentDraft(
  ctx: MapContext,
  userWpId: string,
  course: DraftRef | DraftId,
  fields: Record<string, unknown>,
  precedence: number,
  note: string,
  mapper: MapperId = 'woocommerce',
): EdvoraDraft {
  const wpId = enrollmentWpId(ctx, userWpId, course)
  const user = ctx.ref('wp.user', userWpId)
  return {
    collection: 'enrollments',
    refKey: ctx.refKey('edvora.enrollment', wpId),
    kind: 'edvora.enrollment',
    wpId,
    mapper,
    fields: { user, course, ...fields },
    dependsOn: [user.$ref, ...('$ref' in course ? [course.$ref] : [])],
    precedence,
    notes: [note],
  }
}

const MEMBERSHIP_STATUS: Readonly<Record<string, 'active' | 'cancelled'>> = {
  'wcm-active': 'active',
  'wcm-complimentary': 'active',
  'wcm-free_trial': 'active',
  'wcm-pending': 'active',
  'wcm-paused': 'cancelled',
  'wcm-expired': 'cancelled',
  'wcm-cancelled': 'cancelled',
}

function mapMemberships(ctx: MapContext, drafts: EdvoraDraft[]): void {
  const plans = new Map(ctx.index.all('woo.membership_plan').map((p) => [p.wpId, p]))
  const local = new Map<string, EdvoraDraft>()
  const unresolvedPlans = new Set<string>()
  for (const m of ctx.index.all('woo.membership')) {
    const userWpId = str(m, 'post_author')
    const plan = plans.get(str(m, 'post_parent') ?? '')
    const wcm = str(m, 'post_status') ?? ''
    const status = MEMBERSHIP_STATUS[wcm]
    if (!userWpId || !plan) continue
    if (!status) {
      ctx.notImported(`woo.membership:${wcm}`)
      continue
    }
    const courses = metaIds(plan, '_product_ids')
      .map((pid) => courseRelation(ctx.product(pid)))
      .filter((c): c is DraftRef | DraftId => c !== null)
    if (!courses.length) {
      unresolvedPlans.add(plan.wpId)
      continue
    }
    const endsAt = metaDate(ctx, m, '_end_date')
    for (const course of courses) {
      const d = enrollmentDraft(ctx, userWpId, course, { status, enrolledAt: metaDate(ctx, m, '_start_date') ?? wpDate(ctx, m, 'post_date_gmt', 'post_date') ?? undefined }, 5, `membership:${m.wpId}:${wcm}`)
      if (endsAt) d.notes?.push(`accessEndsAt:${endsAt}`)
      const prev = local.get(d.refKey)
      if (!prev || (prev.fields.status !== 'active' && status === 'active')) local.set(d.refKey, d)
    }
  }
  drafts.push(...local.values())
  for (const planId of unresolvedPlans) {
    const plan = plans.get(planId)
    ctx.warn({ code: 'enrollment_unresolved', severity: 'warn', kind: 'woo.membership_plan', wpId: planId, message: `طرح عضویت «${text(str(plan, 'post_title')) ?? planId}» به هیچ دوره‌ای نمی‌رسد؛ ثبت‌نام‌های آن ساخته نمی‌شود.` })
  }
}

export const woocommerceMapper: StackMapper = {
  id: 'woocommerce',
  kinds: ['woo.product', 'woo.coupon', 'woo.order', 'woo.membership_plan', 'woo.membership'],
  detect: (m) => hasPlugin(m, 'woocommerce') || Boolean(m.woo),
  map(ctx) {
    const drafts: EdvoraDraft[] = []
    mapProducts(ctx, drafts)
    mapCoupons(ctx, drafts)
    mapOrders(ctx, drafts)
    mapMemberships(ctx, drafts)
    return drafts
  },
}
