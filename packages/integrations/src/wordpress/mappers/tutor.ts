/**
 * Tutor LMS: courses › topics › lessons, quizzes + questions (custom tables), enrollments (`tutor_enrolled`
 * posts) and lesson progress (`_tutor_completed_lesson_id_<id>` usermeta).
 */
import { toPersianDigits as fa } from '@edvora/core/digits'
import type { QuestionType } from '@edvora/core/quiz'
import type { SourceRecord } from '../format'
import type { DraftRef, EdvoraDraft, MapContext, StackMapper } from '../types'
import { courseDraft, hasWooPrice, isTrueLabel, lessonDraft, questionDraft, quizDraft } from './lms'
import { enrollmentDraft, hasPlugin } from './woocommerce'
import { meta, metaJson, numId, rialOf, sanitiseWpHtml, sortBy, str, stripTags, text, wpDate } from './util'

const TUTOR_TYPES: Readonly<Record<string, QuestionType>> = {
  single_choice: 'single',
  multiple_choice: 'multiple',
  true_false: 'trueFalse',
  short_answer: 'short',
}

function coursePrice(ctx: MapContext, c: SourceRecord, refKey: string): number | null {
  const title = text(str(c, 'post_title')) ?? c.wpId
  if (meta(c, '_tutor_course_price_type') === 'free') return 0
  const monetizeBy = ctx.manifest.tutor?.monetizeBy ?? 'tutor'
  if (hasWooPrice(ctx, refKey)) return null // the Woo product patch sets it
  if (monetizeBy !== 'tutor') {
    ctx.warn({ code: 'price_missing', severity: 'warn', kind: c.kind, wpId: c.wpId, message: `قیمت دورهٔ «${title}» در محصول فروشگاه است ولی محصولی به آن وصل نیست؛ قیمت خالی می‌ماند.` })
    return null
  }
  const raw = meta(c, 'tutor_course_price')
  const r = rialOf(raw, ctx.manifest.tutor?.currency)
  if (!r.ok) {
    ctx.warn({ code: 'price_invalid', severity: 'warn', kind: c.kind, wpId: c.wpId, message: `قیمت «${raw ?? ''}» دورهٔ «${title}» به ریال تبدیل نشد (${r.code})؛ قیمت خالی می‌ماند.`, detail: { amount: raw, currency: ctx.manifest.tutor?.currency, error: r.code } })
    return null
  }
  return r.value
}

type TutorVideo = { source?: unknown; runtime?: { hours?: unknown; minutes?: unknown; seconds?: unknown } } & Record<string, unknown>

function video(ctx: MapContext, l: SourceRecord): { url: string | null; minutes: number | null } {
  const v = metaJson(l, '_video')
  if (!v || typeof v !== 'object') return { url: null, minutes: null }
  const tv = v as TutorVideo
  const source = typeof tv.source === 'string' ? tv.source : ''
  let url: string | null = null
  if (source === 'html5') {
    const att = ctx.index.get('wp.attachment', String(tv.source_video_id ?? ''))
    const file = meta(att, '_wp_attached_file')
    const uploads = ctx.manifest.site.uploadsBaseUrl?.replace(/\/+$/, '')
    url = file && uploads ? `${uploads}/${file}` : (str(att, 'guid') ?? null)
  } else if (source) {
    const raw = tv[`source_${source}`]
    url = typeof raw === 'string' && raw.trim() ? raw.trim() : null
  }
  const rt = tv.runtime
  const n = (x: unknown) => Number(x ?? 0) || 0
  const total = rt ? n(rt.hours) * 60 + n(rt.minutes) + n(rt.seconds) / 60 : 0
  return { url, minutes: total > 0 ? Math.max(1, Math.round(total)) : null }
}

function mapCourses(ctx: MapContext, drafts: EdvoraDraft[]): Map<string, { ref: DraftRef; slug: string; postName: string }> {
  const courses = new Map<string, { ref: DraftRef; slug: string; postName: string }>()
  for (const c of ctx.index.all('tutor.course')) {
    const status = str(c, 'post_status') ?? 'publish'
    if (status === 'trash' || status === 'auto-draft') continue
    const refKey = ctx.refKey(c.kind, c.wpId)
    const { slug } = courseDraft(ctx, { record: c, mapper: 'tutor', permalinkBase: 'courses', price: coursePrice(ctx, c, refKey) }, drafts)
    courses.set(c.wpId, { ref: { $ref: refKey }, slug, postName: str(c, 'post_name') ?? slug })
  }
  const topics = new Map(ctx.index.all('tutor.topic').map((t) => [t.wpId, t]))
  const byCourse = new Map<string, SourceRecord[]>()
  for (const l of ctx.index.all('tutor.lesson')) {
    const courseId = str(topics.get(str(l, 'post_parent') ?? ''), 'post_parent') ?? meta(l, '_tutor_course_id_for_lesson')
    if (!courseId || !courses.has(courseId)) {
      ctx.notImported('tutor.lesson:orphan')
      continue
    }
    byCourse.set(courseId, [...(byCourse.get(courseId) ?? []), l])
  }
  for (const [courseId, course] of courses) {
    const lessons = byCourse.get(courseId) ?? []
    if (!lessons.length) {
      ctx.warn({ code: 'course_empty', severity: 'info', kind: 'tutor.course', wpId: courseId, message: `دورهٔ «${text(str(ctx.index.get('tutor.course', courseId), 'post_title')) ?? courseId}» جلسه‌ای ندارد.` })
      continue
    }
    const topicOf = (l: SourceRecord) => topics.get(str(l, 'post_parent') ?? '')
    const ordered = sortBy(
      lessons,
      (l) => Number(str(topicOf(l), 'menu_order') ?? Number.MAX_SAFE_INTEGER),
      (l) => Number(str(l, 'post_parent') ?? 0),
      (l) => Number(str(l, 'menu_order') ?? 0),
      numId,
    )
    ordered.forEach((l, i) => {
      const v = video(ctx, l)
      lessonDraft(
        ctx,
        {
          record: l,
          course: course.ref,
          module: text(str(topicOf(l), 'post_title')),
          order: i + 1,
          isFreePreview: meta(l, '_is_preview') === '1',
          videoUrl: v.url,
          durationMinutes: v.minutes,
          mapper: 'tutor',
          permalinkBase: `courses/${course.postName}/lesson`,
          courseSlug: course.slug,
        },
        drafts,
      )
    })
  }
  return courses
}

type QuizOptions = { passing_grade?: unknown; attempts_allowed?: unknown; time_limit?: { time_value?: unknown; time_type?: unknown } }

function mapQuizzes(ctx: MapContext, courses: Map<string, { ref: DraftRef }>, drafts: EdvoraDraft[]): void {
  const topics = new Map(ctx.index.all('tutor.topic').map((t) => [t.wpId, t]))
  const byQuiz = new Map<string, SourceRecord[]>()
  for (const q of ctx.index.all('tutor.question')) {
    const quizId = str(q, 'quiz_id')
    if (quizId) byQuiz.set(quizId, [...(byQuiz.get(quizId) ?? []), q])
  }
  for (const quiz of ctx.index.all('tutor.quiz')) {
    const course = courses.get(str(topics.get(str(quiz, 'post_parent') ?? ''), 'post_parent') ?? '')
    if (!course) {
      ctx.notImported('tutor.quiz:orphan')
      continue
    }
    const questionDrafts: EdvoraDraft[] = []
    let skipped = 0
    for (const q of sortBy(byQuiz.get(quiz.wpId) ?? [], (x) => Number(str(x, 'question_order') ?? 0), numId)) {
      const sourceType = str(q, 'question_type') ?? 'unknown'
      const type = TUTOR_TYPES[sourceType] ?? null
      const answers = sortBy(q.items ?? [], (a) => Number(a.answer_order ?? 0))
      const options = answers
        .map((a) => ({ text: text(typeof a.answer_title === 'string' ? a.answer_title : '') ?? '', isCorrect: String(a.is_correct ?? '0') === '1' }))
        .filter((o) => o.text)
      let correctAnswer: 'true' | 'false' | null = null
      if (type === 'trueFalse') {
        const correct = options.find((o) => o.isCorrect)
        const label = correct ? isTrueLabel(correct.text) : null
        correctAnswer = label === null ? null : label ? 'true' : 'false'
      }
      const d = questionDraft(ctx, {
        record: q,
        course: course.ref,
        type,
        sourceType,
        points: Number(str(q, 'question_mark') ?? 1) || 1,
        text: text(stripTags(str(q, 'question_title'))),
        options,
        correctAnswer,
        acceptedAnswers: type === 'short' ? options.filter((o) => o.isCorrect).map((o) => o.text) : [],
        explanation: sanitiseWpHtml(str(q, 'answer_explanation')).html,
        mapper: 'tutor',
      })
      if (d) {
        drafts.push(d)
        questionDrafts.push(d)
      } else skipped++
    }
    const opt = (metaJson(quiz, 'tutor_quiz_option') ?? {}) as QuizOptions
    const tl = opt.time_limit
    const tv = Number(tl?.time_value ?? 0)
    const unit = String(tl?.time_type ?? 'minutes')
    const timeLimitMin = tv > 0 ? (unit.startsWith('hour') ? tv * 60 : unit.startsWith('second') ? tv / 60 : unit.startsWith('day') ? tv * 1440 : tv) : null
    const passing = Number(opt.passing_grade)
    const attempts = Number(opt.attempts_allowed)
    const d = quizDraft(ctx, {
      record: quiz,
      course: course.ref,
      lesson: null,
      questions: questionDrafts,
      skippedQuestions: skipped,
      passMark: Number.isFinite(passing) && passing > 0 ? passing : null,
      defaultPassMark: 80,
      attemptsLimit: Number.isFinite(attempts) && attempts > 0 ? attempts : null,
      timeLimitMin,
      required: false,
      mapper: 'tutor',
    })
    if (d) drafts.push(d)
  }
}

const TUTOR_ENROLLMENT_STATUS: Readonly<Record<string, 'active' | 'cancelled'>> = { completed: 'active', publish: 'active', cancel: 'cancelled', cancelled: 'cancelled' }

function mapEnrollments(ctx: MapContext, courses: Map<string, { ref: DraftRef }>, drafts: EdvoraDraft[]): void {
  const topics = new Map(ctx.index.all('tutor.topic').map((t) => [t.wpId, t]))
  const lessonCourse = new Map(
    ctx.index.all('tutor.lesson').map((l) => [l.wpId, str(topics.get(str(l, 'post_parent') ?? ''), 'post_parent') ?? meta(l, '_tutor_course_id_for_lesson')]),
  )
  const progress = new Map<string, Set<string>>()
  for (const p of ctx.index.all('tutor.progress')) {
    const user = str(p, 'user_id')
    const lesson = str(p, 'lesson_id')
    const course = lesson ? lessonCourse.get(lesson) : null
    if (!user || !lesson || !course) continue
    const k = `${user}|${course}`
    progress.set(k, (progress.get(k) ?? new Set()).add(lesson))
  }
  const used = new Set<string>()
  for (const e of ctx.index.all('tutor.enrollment')) {
    const user = str(e, 'post_author')
    const courseId = str(e, 'post_parent')
    const course = courses.get(courseId ?? '')
    const status = TUTOR_ENROLLMENT_STATUS[str(e, 'post_status') ?? '']
    if (!user || !course || !ctx.index.get('wp.user', user)) {
      ctx.notImported('tutor.enrollment:unresolved')
      continue
    }
    if (!status) {
      ctx.notImported(`tutor.enrollment:${str(e, 'post_status') ?? ''}`)
      continue
    }
    const k = `${user}|${courseId}`
    used.add(k)
    const lessons = [...(progress.get(k) ?? [])].sort((a, b) => Number(a) - Number(b))
    const d = enrollmentDraft(
      ctx,
      user,
      course.ref,
      { status, enrolledAt: wpDate(ctx, e, 'post_date_gmt', 'post_date') ?? undefined, completedLessons: lessons.map((id) => ctx.ref('tutor.lesson', id)) },
      10,
      `tutor:${str(e, 'post_status') ?? ''}`,
      'tutor',
    )
    d.unionFields = ['completedLessons']
    drafts.push(d)
  }
  let dropped = 0
  for (const [k, ids] of progress) if (!used.has(k)) dropped += ids.size
  if (dropped) {
    ctx.notImported('tutor.progress:no_enrollment', dropped)
    ctx.warn({ code: 'progress_dropped', severity: 'info', kind: 'tutor.progress', wpId: null, message: `${fa(dropped)} جلسهٔ تکمیل‌شده متعلق به ثبت‌نامی نیست که منتقل شود و حساب نمی‌شود.`, detail: { count: dropped } })
  }
}

export const tutorMapper: StackMapper = {
  id: 'tutor',
  kinds: ['tutor.course', 'tutor.topic', 'tutor.lesson', 'tutor.quiz', 'tutor.enrollment', 'tutor.question', 'tutor.progress'],
  detect: (m) => hasPlugin(m, 'tutor') || Boolean(m.tutor),
  map(ctx) {
    const drafts: EdvoraDraft[] = []
    const courses = mapCourses(ctx, drafts)
    mapQuizzes(ctx, courses, drafts)
    mapEnrollments(ctx, courses, drafts)
    if (ctx.index.all('tutor.quiz').length) {
      ctx.warn({ code: 'quiz_attempts_not_imported', severity: 'info', kind: 'tutor.quiz', wpId: null, message: 'سابقهٔ تلاش‌های آزمون منتقل نمی‌شود؛ تکمیل جلسه‌ها از پیشرفت دانشجو می‌آید.' })
    }
    return drafts
  },
}
