'use server'

/**
 * E-032 — server actions of the WordPress import desk. Every input is Zod-validated; every action re-checks the
 * staff session and `import.run` in the academy resolved from the Host header, and returns `{ redirectTo }`
 * instead of calling redirect() (AGENTS.md, ADR 005).
 */
import { normalizeIranMobile, toLatinDigits } from '@edvora/core'
import { after } from 'next/server'
import { z } from 'zod'
import { getPayloadClient } from '../../../../../lib/payload'
import { importActor } from '../../../../../lib/wpimport/access'
import { purgeJob, resolveConflict } from '../../../../../lib/wpimport/commit'
import {
  MAX_BUNDLE_BYTES,
  confirmJob,
  createConnection,
  findJob,
  ingestBundle,
  kickQueue,
  revokeConnection,
  startRest,
  updateChoices,
} from '../../../../../lib/wpimport/service'

export type ImportActionState = {
  ok: boolean
  message: string
  redirectTo?: string
  /** Shown once after creating a connection. */
  secret?: string
  connectionId?: string
  jobId?: number
} | null

const DENIED: ImportActionState = { ok: false, message: 'برای این کار دسترسی «اجرای انتقال از وردپرس» در این آکادمی لازم است.' }
const jobPath = (id: number) => `/staff/import/${id}`
const actorOf = (s: { user: { id: number; email?: string | null } }) => ({ id: s.user.id, email: s.user.email ?? null })
const tenantOf = (s: { tenant: { id: number; slug: string } }) => ({ id: s.tenant.id, slug: s.tenant.slug })

const JobId = z.coerce.number().int().positive()

// ---------------------------------------------------------------- connections

const ConnectionInput = z.object({
  label: z.string().trim().min(2, 'یک نام کوتاه برای این انتقال بنویسید.').max(80),
  mode: z.enum(['push', 'bundle']).default('push'),
})

export async function createConnectionAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const parsed = ConnectionInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  try {
    const payload = await getPayloadClient()
    const { job, connection, secret } = await createConnection({ payload, tenant: tenantOf(s), actor: actorOf(s), label: parsed.data.label, mode: parsed.data.mode })
    return { ok: true, message: 'اتصال ساخته شد.', secret, connectionId: connection.connectionId, jobId: job.id }
  } catch (err) {
    ;(await getPayloadClient()).logger.error({ err, msg: 'createConnection failed' })
    return { ok: false, message: 'ساخت اتصال ممکن نشد. دوباره تلاش کنید.' }
  }
}

const RevokeInput = z.object({ connectionId: z.string().regex(/^cnx_[a-z0-9_]{3,40}$/), back: z.string().regex(/^\/staff\/import(\/\d+)?$/).optional() })

export async function revokeConnectionAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const parsed = RevokeInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: 'درخواست نامعتبر است.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const ok = await revokeConnection({ payload: await getPayloadClient(), tenant: tenantOf(s), actor: actorOf(s), connectionId: parsed.data.connectionId })
  return ok ? { ok: true, message: 'اتصال لغو شد؛ درخواست بعدی افزونه رد می‌شود.', redirectTo: parsed.data.back ?? '/staff/import' } : { ok: false, message: 'این اتصال پیدا نشد.' }
}

// ---------------------------------------------------------------- ingest

export async function uploadBundleAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const file = form.get('bundle')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'فایل خروجی افزونه (.edvora-bundle) را انتخاب کنید.' }
  if (file.size > MAX_BUNDLE_BYTES) return { ok: false, message: 'فایل از حد مجاز بزرگ‌تر است؛ از روش ارسال مستقیم افزونه استفاده کنید.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  try {
    const payload = await getPayloadClient()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const job = await ingestBundle({ payload, tenant: tenantOf(s), actor: actorOf(s), bytes, filename: file.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 120) || 'bundle' })
    return { ok: job.status !== 'rejected', message: job.status === 'rejected' ? 'فایل پذیرفته نشد.' : 'فایل دریافت و بررسی شد.', redirectTo: jobPath(job.id) }
  } catch (err) {
    ;(await getPayloadClient()).logger.error({ err, msg: 'bundle upload failed' })
    return { ok: false, message: 'بررسی فایل ممکن نشد. دوباره تلاش کنید.' }
  }
}

const optionalSecret = z.string().trim().max(200).optional().transform((v) => (v ? v : undefined))
const RestInput = z
  .object({
    siteUrl: z.string().trim().url('نشانی سایت را کامل بنویسید (با https://).').max(200),
    username: z.string().trim().min(1, 'نام کاربری مدیر وردپرس را بنویسید.').max(100),
    applicationPassword: z.string().trim().min(8, 'رمز برنامه (Application Password) را بنویسید.').max(200),
    wooKey: optionalSecret,
    wooSecret: optionalSecret,
    llmsKey: optionalSecret,
    llmsSecret: optionalSecret,
  })
  .refine((v) => /^https:\/\//i.test(v.siteUrl) || /^http:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)(:\d+)?(\/|$)/i.test(v.siteUrl), { message: 'برای امنیت رمزها، نشانی سایت باید https باشد.', path: ['siteUrl'] })

export async function startRestAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const parsed = RestInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const v = parsed.data
  try {
    const job = await startRest({
      payload: await getPayloadClient(),
      tenant: tenantOf(s),
      actor: actorOf(s),
      config: {
        siteUrl: v.siteUrl,
        auth: { username: v.username, applicationPassword: v.applicationPassword },
        woo: v.wooKey && v.wooSecret ? { consumerKey: v.wooKey, consumerSecret: v.wooSecret } : undefined,
        lifterlms: v.llmsKey && v.llmsSecret ? { consumerKey: v.llmsKey, consumerSecret: v.llmsSecret } : undefined,
      },
    })
    return { ok: true, message: 'اتصال بررسی شد.', redirectTo: jobPath(job.id) }
  } catch (err) {
    ;(await getPayloadClient()).logger.error({ err, msg: 'REST start failed' })
    return { ok: false, message: 'اتصال به سایت ممکن نشد. نشانی و رمزها را بررسی کنید.' }
  }
}

// ---------------------------------------------------------------- dry-run choices

const MAPPERS = ['woocommerce', 'lifterlms', 'tutor'] as const

export async function saveChoicesAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const jobId = JobId.safeParse(form.get('jobId'))
  if (!jobId.success) return { ok: false, message: 'درخواست نامعتبر است.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const payload = await getPayloadClient()
  const job = await findJob(payload, s.tenant.id, jobId.data)
  if (!job) return { ok: false, message: 'این انتقال پیدا نشد.' }

  const lms = form.get('lms')
  const lmsChoice = typeof lms === 'string' && (lms === 'lifterlms' || lms === 'tutor') ? lms : null
  const report = (job.report ?? {}) as { detected?: string[]; productCourseMap?: { productWpId: string }[]; courseOptions?: { refKey: string }[]; existingCourses?: { id: number }[] }
  const courseRefs = new Set((report.courseOptions ?? []).map((c) => c.refKey))
  const courseIds = new Set((report.existingCourses ?? []).map((c) => c.id))
  const overrides: Record<string, { course: string } | { courseId: number } | 'standalone' | 'skip'> = {}
  for (const link of report.productCourseMap ?? []) {
    const raw = form.get(`product:${link.productWpId}`)
    // Unchanged automatic proposals are not pinned: they follow the plan (e.g. after switching the LMS).
    if (typeof raw !== 'string' || raw === '' || raw === form.get(`auto:${link.productWpId}`)) continue
    if (raw === 'standalone' || raw === 'skip') overrides[link.productWpId] = raw
    else if (raw.startsWith('ref:') && courseRefs.has(raw.slice(4))) overrides[link.productWpId] = { course: raw.slice(4) }
    // An existing Edvora course must belong to this academy (listed in the report for this tenant only).
    else if (raw.startsWith('id:') && courseIds.has(Number(raw.slice(3)))) overrides[link.productWpId] = { courseId: Number(raw.slice(3)) }
  }
  const hosts = form.getAll('approveHost').filter((h): h is string => typeof h === 'string' && /^[a-z0-9.-]+(:\d+)?$/i.test(h)).map((h) => h.toLowerCase())

  const result = await updateChoices({
    payload,
    tenant: tenantOf(s),
    actor: actorOf(s),
    jobId: job.id,
    patch: (c) => {
      const enabledMappers = lmsChoice ? MAPPERS.filter((m) => m === 'woocommerce' || m === lmsChoice) : c.enabledMappers
      // Overrides pointing at courses of an LMS that is no longer imported are dropped.
      const off = MAPPERS.filter((m) => m !== 'woocommerce' && enabledMappers && !enabledMappers.includes(m))
      const kept = Object.fromEntries(
        Object.entries({ ...(c.productCourseOverrides ?? {}), ...overrides }).filter(([, v]) => !(typeof v === 'object' && 'course' in v && off.some((m) => v.course.includes(`:${m}.`)))),
      )
      return { ...c, enabledMappers, productCourseOverrides: kept, approvedHosts: hosts }
    },
  })
  if ('ok' in result && result.ok === false) return { ok: false, message: result.message }
  return { ok: true, message: 'انتخاب‌ها ذخیره و گزارش دوباره ساخته شد.', redirectTo: jobPath(job.id) }
}

const PhoneInput = z.object({
  jobId: JobId,
  wpId: z.string().regex(/^\d{1,20}$/),
  phone: z.string().transform((v, ctx) => {
    const p = normalizeIranMobile(toLatinDigits(v))
    if (!p) ctx.addIssue({ code: 'custom', message: 'شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).' })
    return p ?? ''
  }),
})

/** "Add phone" for a held user (W8a/W8b): the phone is used on the next plan; the user is then created normally. */
export async function setHeldPhoneAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const parsed = PhoneInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const { jobId, wpId, phone } = parsed.data
  const result = await updateChoices({
    payload: await getPayloadClient(),
    tenant: tenantOf(s),
    actor: actorOf(s),
    jobId,
    patch: (c) => ({ ...c, phoneOverrides: { ...(c.phoneOverrides ?? {}), [wpId]: phone } }),
  })
  if ('ok' in result && result.ok === false) return { ok: false, message: result.message }
  return { ok: true, message: 'شماره ثبت شد.', redirectTo: `${jobPath(jobId)}#held` }
}

// ---------------------------------------------------------------- run

export async function confirmImportAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const jobId = JobId.safeParse(form.get('jobId'))
  if (!jobId.success || form.get('confirm') !== 'yes') return { ok: false, message: 'برای اجرا، تأیید را بزنید.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const payload = await getPayloadClient()
  const result = await confirmJob({ payload, tenant: tenantOf(s), actor: actorOf(s), jobId: jobId.data })
  if (!result.ok) return { ok: false, message: result.message, redirectTo: result.code === 'changed' || result.code === 'blocking' ? `${jobPath(jobId.data)}?notice=${result.code}` : undefined }
  // Start right away; the queue's autoRun picks up whatever is left if this process stops.
  after(() => kickQueue(payload))
  return { ok: true, message: 'انتقال شروع شد.', redirectTo: jobPath(jobId.data) }
}

const ConflictInput = z.object({ jobId: JobId, refKey: z.string().min(5).max(400), choice: z.enum(['keep', 'wp']) })

export async function resolveConflictAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const parsed = ConflictInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: 'درخواست نامعتبر است.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  try {
    const ok = await resolveConflict(await getPayloadClient(), { tenant: tenantOf(s), actor: actorOf(s), ...parsed.data })
    return ok ? { ok: true, message: 'ثبت شد.', redirectTo: `${jobPath(parsed.data.jobId)}#conflicts` } : { ok: false, message: 'این تعارض دیگر قابل حل نیست (شاید دادهٔ خام پاک شده است).' }
  } catch (err) {
    ;(await getPayloadClient()).logger.error({ err, msg: 'resolveConflict failed' })
    return { ok: false, message: 'ثبت ممکن نشد.' }
  }
}

export async function purgeNowAction(_prev: ImportActionState, form: FormData): Promise<ImportActionState> {
  const jobId = JobId.safeParse(form.get('jobId'))
  if (!jobId.success || form.get('confirm') !== 'yes') return { ok: false, message: 'برای حذف، تأیید را بزنید.' }
  const s = await importActor('import.run')
  if (!s) return DENIED
  const payload = await getPayloadClient()
  const job = await findJob(payload, s.tenant.id, jobId.data)
  if (!job || job.status === 'media' || job.status === 'committing') return { ok: false, message: 'این انتقال در حال اجراست یا پیدا نشد.' }
  await purgeJob(payload, job.id, s.tenant.id, { force: true, actor: actorOf(s) })
  return { ok: true, message: 'دادهٔ خام حذف شد.', redirectTo: jobPath(job.id) }
}
