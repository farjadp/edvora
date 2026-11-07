/**
 * LifterLMS: course › section › lesson, quizzes/questions, access-plan prices, enrollments and lesson progress
 * from `lifterlms_user_postmeta`, earned certificates. LifterLMS orders/coupons are counted, not imported
 * (WooCommerce is the sales record on the sites we know, e.g. IBA).
 */
import { toPersianDigits as fa } from '@edvora/core/digits'
import { parseWpDateGmt } from '@edvora/core/wpimport'
import type { QuestionType } from '@edvora/core/quiz'
import type { SourceRecord } from '../format'
import type { DraftRef, EdvoraDraft, MapContext, StackMapper } from '../types'
import { courseDraft, hasWooPrice, isTrueLabel, lessonDraft, questionDraft, quizDraft } from './lms'
import { enrollmentDraft, hasPlugin } from './woocommerce'
import { decodeMetaJson } from '../format'
import { isYes, meta, metaDate, metaNum, numId, rialOf, sortBy, str, stripTags, text, userDisplayName, wpDate } from './util'

const COUNTED_ONLY = ['lifterlms.coupon', 'lifterlms.order', 'lifterlms.transaction', 'lifterlms.membership'] as const

function coursePrice(ctx: MapContext, course: SourceRecord, courseRefKey: string): number | null {
  const title = text(str(course, 'post_title')) ?? course.wpId
  const plans = sortBy(
    ctx.index.all('lifterlms.access_plan').filter((p) => meta(p, '_llms_product_id') === course.wpId && (str(p, 'post_status') ?? 'publish') === 'publish'),
    (p) => (Number(meta(p, '_llms_frequency') ?? 0) > 0 ? 1 : 0),
    (p) => Number(str(p, 'menu_order') ?? 0),
    numId,
  )
  const woo = hasWooPrice(ctx, courseRefKey)
  const plan = plans[0]
  if (!plan) {
    if (!woo) ctx.warn({ code: 'price_missing', severity: 'warn', kind: course.kind, wpId: course.wpId, message: `دورهٔ «${title}» طرح قیمت ندارد؛ قیمت خالی می‌ماند (TODO: از آکادمی بپرسید).` })
    return null
  }
  if (Number(meta(plan, '_llms_frequency') ?? 0) > 0) {
    ctx.warn({ code: 'recurring_plan', severity: 'warn', kind: plan.kind, wpId: plan.wpId, message: `طرح قیمت دورهٔ «${title}» اشتراکی (تکرارشونده) است؛ ادوورا آن را یک‌جا قیمت‌گذاری می‌کند و باید بازبینی شود.` })
  }
  if (isYes(meta(plan, '_llms_is_free'))) return 0
  const raw = meta(plan, '_llms_price')
  const r = rialOf(raw, ctx.manifest.lifterlms?.currency)
  if (!r.ok) {
    if (!woo) ctx.warn({ code: 'price_invalid', severity: 'warn', kind: plan.kind, wpId: plan.wpId, message: `قیمت «${raw ?? ''}» دورهٔ «${title}» به ریال تبدیل نشد (${r.code})؛ قیمت خالی می‌ماند.`, detail: { amount: raw, currency: ctx.manifest.lifterlms?.currency, error: r.code } })
    return null
  }
  if (!woo && Number(raw) <= 1) {
    ctx.warn({ code: 'price_suspicious', severity: 'warn', kind: plan.kind, wpId: plan.wpId, message: `قیمت طرح دورهٔ «${title}» ${fa(raw ?? '')} است و احتمالاً عدد موقت است؛ پیش از انتشار بازبینی کنید.` })
  }
  return r.value
}

function lessonDrip(ctx: MapContext, l: SourceRecord): Record<string, unknown> {
  const method = meta(l, '_llms_drip_method')
  if (method === 'enrollment') return { mode: 'afterEnrollment', days: Math.max(0, Math.round(metaNum(l, '_llms_days_before_available') ?? 0)) }
  if (method === 'date') {
    const date = meta(l, '_llms_date_available')
    const time = meta(l, '_llms_time_available') ?? '00:00'
    const m = date ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date) : null
    const iso = m ? `${m[3]}-${m[1]?.padStart(2, '0')}-${m[2]?.padStart(2, '0')} ${/^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5).padStart(5, '0') : '00:00'}:00` : date
    const at = parseWpDateGmt(null, iso, ctx.manifest.site.gmtOffset)
    if (at) return { mode: 'fixedDate', releaseAt: at.toISOString() }
  }
  return { mode: 'none' }
}

function mapCourses(ctx: MapContext, drafts: EdvoraDraft[]): Map<string, { ref: DraftRef; slug: string }> {
  const courses = new Map<string, { ref: DraftRef; slug: string }>()
  for (const c of ctx.index.all('lifterlms.course')) {
    const status = str(c, 'post_status') ?? 'publish'
    if (status === 'trash' || status === 'auto-draft') continue
    const refKey = ctx.refKey(c.kind, c.wpId)
    const { slug } = courseDraft(ctx, { record: c, mapper: 'lifterlms', permalinkBase: 'course', price: coursePrice(ctx, c, refKey) }, drafts)
    courses.set(c.wpId, { ref: { $ref: refKey }, slug })
  }

  const sections = new Map(ctx.index.all('lifterlms.section').map((s) => [s.wpId, s]))
  const byCourse = new Map<string, SourceRecord[]>()
  for (const l of ctx.index.all('lifterlms.lesson')) {
    const courseId = meta(l, '_llms_parent_course') ?? meta(sections.get(meta(l, '_llms_parent_section') ?? ''), '_llms_parent_course')
    if (!courseId || !courses.has(courseId)) {
      ctx.notImported('lifterlms.lesson:orphan')
      continue
    }
    byCourse.set(courseId, [...(byCourse.get(courseId) ?? []), l])
  }
  for (const [courseId, course] of courses) {
    const lessons = byCourse.get(courseId) ?? []
    if (!lessons.length) {
      const rec = ctx.index.get('lifterlms.course', courseId)
      ctx.warn({ code: 'course_empty', severity: 'info', kind: 'lifterlms.course', wpId: courseId, message: `دورهٔ «${text(str(rec, 'post_title')) ?? courseId}» جلسه‌ای ندارد.` })
      continue
    }
    const ordered = sortBy(
      lessons,
      (l) => metaNum(sections.get(meta(l, '_llms_parent_section') ?? ''), '_llms_order') ?? Number.MAX_SAFE_INTEGER,
      (l) => Number(meta(l, '_llms_parent_section') ?? 0),
      (l) => metaNum(l, '_llms_order') ?? Number(str(l, 'menu_order') ?? 0),
      numId,
    )
    ordered.forEach((l, i) => {
      const section = sections.get(meta(l, '_llms_parent_section') ?? '')
      lessonDraft(
        ctx,
        {
          record: l,
          course: course.ref,
          module: text(str(section, 'post_title')),
          order: i + 1,
          isFreePreview: isYes(meta(l, '_llms_free_lesson')),
          videoUrl: meta(l, '_llms_video_embed'),
          durationMinutes: null,
          drip: lessonDrip(ctx, l),
          mapper: 'lifterlms',
          permalinkBase: 'lesson',
          courseSlug: course.slug,
        },
        drafts,
      )
    })
  }
  return courses
}

type Choice = { text: string; correct: boolean; marker: string }

function choices(q: SourceRecord): Choice[] {
  const out: Choice[] = []
  for (const key of Object.keys(q.meta ?? {})) {
    if (!key.startsWith('_llms_choice_')) continue
    const v = decodeMetaJson(q.meta?.[key] ?? null)
    if (!v || typeof v !== 'object') continue
    const o = v as { choice?: unknown; correct?: unknown; marker?: unknown }
    const t = typeof o.choice === 'string' ? text(stripTags(o.choice) ?? o.choice) : null
    if (t) out.push({ text: t, correct: o.correct === true || o.correct === 'yes' || o.correct === '1', marker: typeof o.marker === 'string' ? o.marker : key })
  }
  return sortBy(out, (c) => c.marker)
}

function mapQuizzes(ctx: MapContext, courses: Map<string, { ref: DraftRef }>, drafts: EdvoraDraft[]): void {
  const lessons = new Map(ctx.index.all('lifterlms.lesson').map((l) => [l.wpId, l]))
  const questionsByQuiz = new Map<string, SourceRecord[]>()
  for (const q of ctx.index.all('lifterlms.question')) {
    const parent = meta(q, '_llms_parent_id')
    if (parent) questionsByQuiz.set(parent, [...(questionsByQuiz.get(parent) ?? []), q])
  }
  for (const quiz of ctx.index.all('lifterlms.quiz')) {
    const lessonId = meta(quiz, '_llms_lesson_id') ?? [...lessons.values()].find((l) => meta(l, '_llms_quiz') === quiz.wpId)?.wpId ?? null
    const lesson = lessonId ? lessons.get(lessonId) : undefined
    const course = courses.get(meta(lesson, '_llms_parent_course') ?? '')
    if (!course) {
      ctx.notImported('lifterlms.quiz:orphan')
      continue
    }
    const questionDrafts: EdvoraDraft[] = []
    let skipped = 0
    for (const q of sortBy(questionsByQuiz.get(quiz.wpId) ?? [], (x) => Number(str(x, 'menu_order') ?? 0), numId)) {
      const sourceType = meta(q, '_llms_question_type') ?? 'unknown'
      if (sourceType === 'content') continue // a text block between questions, not a question
      const opts = choices(q)
      let type: QuestionType | null = null
      let correctAnswer: 'true' | 'false' | null = null
      let acceptedAnswers: string[] = []
      if (sourceType === 'choice') type = isYes(meta(q, '_llms_multi_choices')) ? 'multiple' : 'single'
      else if (sourceType === 'true_false') {
        type = 'trueFalse'
        const correct = opts.find((o) => o.correct)
        const label = correct ? isTrueLabel(correct.text) : null
        correctAnswer = label === null ? (correct ? (correct.marker === 'A' ? 'true' : 'false') : null) : label ? 'true' : 'false'
      } else if (sourceType === 'short_answer') {
        acceptedAnswers = (meta(q, '_llms_correct_value') ?? '').split(/[|,\n]/).map((a) => a.trim()).filter(Boolean)
        type = acceptedAnswers.length ? 'short' : null
      }
      const d = questionDraft(ctx, {
        record: q,
        course: course.ref,
        type,
        sourceType: type === null && sourceType === 'short_answer' ? 'short_answer (بدون پاسخ درست)' : sourceType,
        points: metaNum(q, '_llms_points') ?? 1,
        text: text(str(q, 'post_title')),
        options: opts.map((o) => ({ text: o.text, isCorrect: o.correct })),
        correctAnswer,
        acceptedAnswers,
        explanation: stripTags(meta(q, '_llms_clarifications')),
        mapper: 'lifterlms',
      })
      if (d) {
        drafts.push(d)
        questionDrafts.push(d)
      } else skipped++
    }
    const d = quizDraft(ctx, {
      record: quiz,
      course: course.ref,
      lesson: lesson ? ctx.ref(lesson.kind, lesson.wpId) : null,
      questions: questionDrafts,
      skippedQuestions: skipped,
      passMark: metaNum(quiz, '_llms_passing_percent'),
      defaultPassMark: 65,
      attemptsLimit: isYes(meta(quiz, '_llms_limit_attempts')) ? metaNum(quiz, '_llms_allowed_attempts') : null,
      timeLimitMin: isYes(meta(quiz, '_llms_limit_time')) ? metaNum(quiz, '_llms_time_limit') : null,
      required: isYes(meta(lesson, '_llms_require_passing_grade')),
      mapper: 'lifterlms',
    })
    if (d) drafts.push(d)
  }
}

/** Custom-table values may arrive as `json:"enrolled"`; scalars are unwrapped, anything else kept raw. */
function plainMeta(v: string | null): string {
  if (!v) return ''
  const d = decodeMetaJson(v)
  return typeof d === 'string' || typeof d === 'number' || typeof d === 'boolean' ? String(d) : v
}

type MetaRow = { userId: string; postId: string; key: string; value: string; at: number; id: number }

function userMetaRows(ctx: MapContext): MetaRow[] {
  return ctx.index.all('lifterlms.user_meta').map((r) => ({
    userId: str(r, 'user_id') ?? '',
    postId: str(r, 'post_id') ?? '',
    key: str(r, 'meta_key') ?? '',
    value: plainMeta(str(r, 'meta_value')),
    // updated_date is site-local time (LifterLMS uses current_time('mysql')).
    at: parseWpDateGmt(null, str(r, 'updated_date'), ctx.manifest.site.gmtOffset)?.getTime() ?? 0,
    id: numId(r),
  }))
}

const LLMS_ENROLLMENT_STATUS: Readonly<Record<string, 'active' | 'cancelled'>> = { enrolled: 'active', expired: 'cancelled', cancelled: 'cancelled' }

function mapEnrollments(ctx: MapContext, courses: Map<string, { ref: DraftRef }>, drafts: EdvoraDraft[]): void {
  const rows = userMetaRows(ctx)
  const lessonCourse = new Map(ctx.index.all('lifterlms.lesson').map((l) => [l.wpId, meta(l, '_llms_parent_course')]))
  const groups = new Map<string, MetaRow[]>()
  for (const row of rows) {
    const k = `${row.userId}|${row.postId}`
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  const completed = new Map<string, Set<string>>() // `${user}|${course}` → lesson ids
  for (const row of rows) {
    if (row.key !== '_is_complete' || row.value !== 'yes') continue
    const courseId = lessonCourse.get(row.postId)
    if (!courseId) continue
    const k = `${row.userId}|${courseId}`
    completed.set(k, (completed.get(k) ?? new Set()).add(row.postId))
  }
  const used = new Set<string>()
  for (const [k, list] of groups) {
    const [userId = '', postId = ''] = k.split('|')
    const course = courses.get(postId)
    if (!course) {
      if (ctx.index.get('lifterlms.membership', postId) && list.some((r) => r.key === '_status')) ctx.notImported('lifterlms.membership_enrollment')
      continue
    }
    const statusRow = sortBy(list.filter((r) => r.key === '_status'), (r) => -r.at, (r) => -r.id)[0]
    if (!statusRow) continue
    if (!ctx.index.get('wp.user', userId)) {
      ctx.notImported('lifterlms.enrollment:no_user')
      continue
    }
    const mapped = LLMS_ENROLLMENT_STATUS[statusRow.value]
    if (!mapped) {
      ctx.notImported(`lifterlms.enrollment:${statusRow.value}`)
      continue
    }
    const courseDone = list.some((r) => r.key === '_is_complete' && r.value === 'yes')
    const start = sortBy(list.filter((r) => r.key === '_start_date' && r.value), (r) => r.value)[0]
    const lessonIds = [...(completed.get(k) ?? [])].sort((a, b) => Number(a) - Number(b))
    used.add(k)
    const d = enrollmentDraft(
      ctx,
      userId,
      course.ref,
      {
        status: mapped === 'active' && courseDone ? 'completed' : mapped,
        enrolledAt: start ? (parseWpDateGmt(null, start.value, ctx.manifest.site.gmtOffset)?.toISOString() ?? undefined) : undefined,
        completedLessons: lessonIds.map((id) => ctx.ref('lifterlms.lesson', id)),
      },
      10,
      `lifterlms:${statusRow.value}`,
      'lifterlms',
    )
    d.unionFields = ['completedLessons']
    drafts.push(d)
  }
  let dropped = 0
  for (const [k, ids] of completed) if (!used.has(k)) dropped += ids.size
  if (dropped) {
    ctx.notImported('lifterlms.progress:no_enrollment', dropped)
    ctx.warn({ code: 'progress_dropped', severity: 'info', kind: 'lifterlms.user_meta', wpId: null, message: `${fa(dropped)} جلسهٔ تکمیل‌شده متعلق به ثبت‌نامی نیست که منتقل شود و حساب نمی‌شود.`, detail: { count: dropped } })
  }
}

function certificateCourse(ctx: MapContext, relatedId: string | null, courses: Map<string, { ref: DraftRef }>): DraftRef | null {
  if (!relatedId) return null
  if (courses.has(relatedId)) return courses.get(relatedId)?.ref ?? null
  for (const kind of ['lifterlms.lesson', 'lifterlms.section']) {
    const parent = meta(ctx.index.get(kind, relatedId), '_llms_parent_course')
    if (parent && courses.has(parent)) return courses.get(parent)?.ref ?? null
  }
  const quizLesson = meta(ctx.index.get('lifterlms.quiz', relatedId), '_llms_lesson_id')
  return quizLesson ? certificateCourse(ctx, quizLesson, courses) : null
}

function mapCertificates(ctx: MapContext, courses: Map<string, { ref: DraftRef }>, drafts: EdvoraDraft[]): void {
  const earned = new Map<string, MetaRow>()
  for (const row of userMetaRows(ctx)) if (row.key === '_certificate_earned') earned.set(row.value, row)
  for (const c of ctx.index.all('lifterlms.certificate')) {
    const row = earned.get(c.wpId)
    const author = str(c, 'post_author')
    const userId = author && author !== '0' && ctx.index.get('wp.user', author) ? author : (row?.userId ?? null)
    const course = certificateCourse(ctx, meta(c, '_llms_related') ?? row?.postId ?? null, courses)
    const title = text(str(c, 'post_title')) ?? c.wpId
    if (!userId || !ctx.index.get('wp.user', userId) || !course) {
      ctx.warn({ code: 'certificate_unresolved', severity: 'warn', kind: c.kind, wpId: c.wpId, message: `گواهی «${title}» به کاربر یا دوره‌ای که منتقل می‌شود نمی‌رسد و وارد نمی‌شود.` })
      continue
    }
    const issuedAt = metaDate(ctx, c, '_llms_awarded') ?? wpDate(ctx, c, 'post_date_gmt', 'post_date')
    if (!issuedAt) ctx.warn({ code: 'certificate_no_date', severity: 'warn', kind: c.kind, wpId: c.wpId, message: `گواهی «${title}» تاریخ صدور ندارد؛ تاریخ خالی می‌ماند.` })
    const user = ctx.ref('wp.user', userId)
    drafts.push({
      collection: 'certificates',
      refKey: ctx.refKey(c.kind, c.wpId),
      kind: c.kind,
      wpId: c.wpId,
      mapper: 'lifterlms',
      fields: {
        holderName: userDisplayName(ctx.index.get('wp.user', userId)) ?? title,
        user,
        course,
        issuedAt,
        status: 'valid',
        legacyId: c.wpId,
        legacyCode: meta(c, '_llms_sequential_id') ?? undefined,
        legacyUrl: str(c, 'guid') ?? undefined,
      },
      dependsOn: [user.$ref, course.$ref],
      precedence: 10,
    })
  }
}

export const lifterlmsMapper: StackMapper = {
  id: 'lifterlms',
  kinds: [
    'lifterlms.course',
    'lifterlms.section',
    'lifterlms.lesson',
    'lifterlms.quiz',
    'lifterlms.question',
    'lifterlms.access_plan',
    'lifterlms.certificate',
    'lifterlms.user_meta',
    ...COUNTED_ONLY,
  ],
  detect: (m) => hasPlugin(m, 'lifterlms') || Boolean(m.lifterlms),
  map(ctx) {
    const drafts: EdvoraDraft[] = []
    const courses = mapCourses(ctx, drafts)
    mapQuizzes(ctx, courses, drafts)
    mapEnrollments(ctx, courses, drafts)
    mapCertificates(ctx, courses, drafts)
    for (const kind of COUNTED_ONLY) {
      const n = ctx.index.all(kind).length
      if (n) ctx.notImported(kind, n)
    }
    if (ctx.index.all('lifterlms.quiz').length) {
      ctx.warn({ code: 'quiz_attempts_not_imported', severity: 'info', kind: 'lifterlms.quiz', wpId: null, message: 'سابقهٔ تلاش‌های آزمون منتقل نمی‌شود؛ تکمیل جلسه‌ها از پیشرفت دانشجو می‌آید.' })
    }
    return drafts
  },
}
