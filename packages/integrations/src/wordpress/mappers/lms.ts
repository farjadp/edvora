/** Builders shared by the LifterLMS and Tutor mappers (lessons, questions, quizzes, courses, certificates). */
import { toPersianDigits as fa } from '@edvora/core/digits'
import { validateQuestion, validateQuiz, type QuestionType } from '@edvora/core/quiz'
import type { SourceRecord } from '../format'
import type { DraftRef, EdvoraDraft, MapContext, MapperId } from '../types'
import { redirectDraft } from './wp-core'
import { classifyVideo, mediaRef, meta, sanitiseWpHtml, slugFrom, sourceUrl, str, stripTags, text, type VideoInfo } from './util'

export type LessonInput = {
  record: SourceRecord
  course: DraftRef
  module: string | null
  order: number
  isFreePreview: boolean
  videoUrl: string | null
  durationMinutes: number | null
  drip?: Record<string, unknown>
  mapper: MapperId
  /** WP permalink base for the lesson post type (e.g. `lesson`), for its redirect. */
  permalinkBase: string
  courseSlug: string
}

export function lessonDraft(ctx: MapContext, i: LessonInput, drafts: EdvoraDraft[]): void {
  const r = i.record
  const title = text(str(r, 'post_title')) ?? `#${r.wpId}`
  const content = str(r, 'post_content')
  const video: VideoInfo = classifyVideo(i.videoUrl, content)
  const { shortcodes } = sanitiseWpHtml(content)
  if (video.videoStatus === 'needs-action') {
    ctx.warn({ code: 'video_needs_action', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `ویدیوی جلسهٔ «${title}» (${video.provider}) قابل انتقال خودکار نیست؛ جلسه بدون ویدیو ساخته می‌شود و باید دستی بارگذاری شود.`, detail: { provider: video.provider } })
  } else if (video.videoStatus === 'external') {
    ctx.warn({ code: 'video_external', severity: 'info', kind: r.kind, wpId: r.wpId, message: `ویدیوی جلسهٔ «${title}» روی ${video.provider} است و محافظت نمی‌شود.`, detail: { provider: video.provider } })
  }
  const otherShortcodes = shortcodes.filter((s) => !/presto|spot/.test(s))
  if (otherShortcodes.length) {
    ctx.warn({ code: 'shortcodes_removed', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `کدهای کوتاه (shortcode) در جلسهٔ «${title}» حذف شدند: ${otherShortcodes.join('، ')}.`, detail: { shortcodes: otherShortcodes } })
  }
  const refKey = ctx.refKey(r.kind, r.wpId)
  drafts.push({
    collection: 'lessons',
    refKey,
    kind: r.kind,
    wpId: r.wpId,
    mapper: i.mapper,
    fields: {
      course: i.course,
      title,
      module: i.module ?? undefined,
      order: i.order,
      durationMinutes: i.durationMinutes ?? undefined,
      isFreePreview: i.isFreePreview,
      videoUrl: video.videoUrl ?? undefined,
      videoStatus: video.videoStatus === 'none' ? undefined : video.videoStatus,
      notesHtml: sanitiseWpHtml(content).html ?? undefined,
      drip: i.drip ?? { mode: 'none' },
    },
    dependsOn: [i.course.$ref],
    precedence: 10,
  })
  const slug = str(r, 'post_name')
  if (slug) drafts.push(redirectDraft(ctx, `/${i.permalinkBase}/${slug}`, ctx.paths.course(i.courseSlug), refKey, i.mapper))
}

export type CourseInput = {
  record: SourceRecord
  mapper: MapperId
  permalinkBase: string
  price: number | null
}

export function courseDraft(ctx: MapContext, i: CourseInput, drafts: EdvoraDraft[]): { refKey: string; slug: string } {
  const r = i.record
  const title = text(str(r, 'post_title')) ?? `#${r.wpId}`
  const slug = slugFrom(str(r, 'post_name'), title, r.wpId)
  const refKey = ctx.refKey(r.kind, r.wpId)
  drafts.push({
    collection: 'courses',
    refKey,
    kind: r.kind,
    wpId: r.wpId,
    mapper: i.mapper,
    fields: {
      title,
      slug,
      summary: stripTags(str(r, 'post_excerpt')) ?? undefined,
      heroImage: mediaRef(ctx, meta(r, '_thumbnail_id')),
      price: i.price,
      maxInstalments: 1,
      status: 'draft',
      sourceUrl: sourceUrl(ctx, `${i.permalinkBase}/${slug}`),
    },
    dependsOn: [],
    precedence: 10,
    notes: [`wpStatus:${str(r, 'post_status') ?? ''}`],
  })
  const postName = str(r, 'post_name')
  if (postName) drafts.push(redirectDraft(ctx, `/${i.permalinkBase}/${postName}`, ctx.paths.course(slug), refKey, i.mapper))
  return { refKey, slug }
}

/** True when some Woo product is linked to this course (its price then wins; LMS price is not checked). */
export function hasWooPrice(ctx: MapContext, courseRefKey: string): boolean {
  return ctx.index.all('woo.product').some((p) => ctx.product(p.wpId)?.courseRefKey === courseRefKey)
}

export type QuestionInput = {
  record: SourceRecord
  course: DraftRef
  type: QuestionType | null
  /** Source type name, for warnings. */
  sourceType: string
  points: number
  text: string | null
  options?: { text: string; isCorrect: boolean }[]
  correctAnswer?: 'true' | 'false' | null
  acceptedAnswers?: string[]
  explanation?: string | null
  mapper: MapperId
}

/** Question draft, or null (skipped with a warning) for unsupported types / invalid content. */
export function questionDraft(ctx: MapContext, i: QuestionInput): EdvoraDraft | null {
  const r = i.record
  const label = i.text ?? `#${r.wpId}`
  if (!i.type) {
    ctx.warn({ code: 'question_type_unsupported', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `نوع سؤال «${i.sourceType}» در ادوورا پشتیبانی نمی‌شود؛ سؤال «${label}» وارد نمی‌شود.`, detail: { type: i.sourceType } })
    return null
  }
  const draft = {
    type: i.type,
    text: i.text,
    points: i.points,
    options: i.type === 'single' || i.type === 'multiple' ? (i.options ?? []) : [],
    correctAnswer: i.type === 'trueFalse' ? (i.correctAnswer ?? null) : null,
    acceptedAnswers: i.type === 'short' ? (i.acceptedAnswers ?? []).map((answer) => ({ answer })) : [],
  }
  const errors = validateQuestion(draft)
  if (errors.length) {
    ctx.warn({ code: 'question_invalid', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `سؤال «${label}» کامل نیست (${errors.map((e) => e.message).join(' ')}) و وارد نمی‌شود.`, detail: { errors } })
    return null
  }
  return {
    collection: 'questions',
    refKey: ctx.refKey(r.kind, r.wpId),
    kind: r.kind,
    wpId: r.wpId,
    mapper: i.mapper,
    fields: {
      course: i.course,
      type: i.type,
      points: i.points,
      text: i.text,
      options: draft.options.length ? draft.options : undefined,
      correctAnswer: draft.correctAnswer ?? undefined,
      acceptedAnswers: draft.acceptedAnswers.length ? draft.acceptedAnswers : undefined,
      explanationHtml: i.explanation ?? undefined,
      archived: false,
    },
    dependsOn: [i.course.$ref],
    precedence: 10,
  }
}

export type QuizInput = {
  record: SourceRecord
  course: DraftRef
  lesson: DraftRef | null
  questions: EdvoraDraft[]
  skippedQuestions: number
  passMark: number | null
  /** Plugin default used when `passMark` is missing. */
  defaultPassMark: number
  attemptsLimit: number | null
  timeLimitMin: number | null
  required: boolean
  mapper: MapperId
}

export function quizDraft(ctx: MapContext, i: QuizInput): EdvoraDraft | null {
  const r = i.record
  const title = text(str(r, 'post_title')) ?? `#${r.wpId}`
  if (!i.questions.length) {
    ctx.warn({ code: 'quiz_empty', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `آزمون «${title}» هیچ سؤال قابل‌انتقالی ندارد و ساخته نمی‌شود.`, detail: { skippedQuestions: i.skippedQuestions } })
    return null
  }
  if (i.skippedQuestions) {
    ctx.warn({ code: 'quiz_incomplete', severity: 'warn', kind: r.kind, wpId: r.wpId, message: `آزمون «${title}» ناقص است: ${fa(i.skippedQuestions)} سؤال منتقل نشد و جمع امتیازها تغییر کرده است؛ حد قبولی را بازبینی کنید.`, detail: { skippedQuestions: i.skippedQuestions } })
  }
  let passMark = i.passMark === null ? null : Math.round(i.passMark)
  if (passMark === null || passMark < 1 || passMark > 100) {
    ctx.warn({ code: 'quiz_defaults', severity: 'info', kind: r.kind, wpId: r.wpId, message: `حد قبولی آزمون «${title}» مشخص نبود؛ پیش‌فرض افزونه (${fa(i.defaultPassMark)}٪) گذاشته شد.` })
    passMark = i.defaultPassMark
  }
  const attemptsLimit = i.attemptsLimit && i.attemptsLimit >= 1 ? Math.round(i.attemptsLimit) : null
  const timeLimitMin = i.timeLimitMin && i.timeLimitMin > 0 ? Math.ceil(i.timeLimitMin) : null
  if (validateQuiz({ questionCount: i.questions.length, passMark, attemptsLimit, timeLimitMin }).length) return null
  const lessonDeps = i.lesson ? [i.lesson.$ref] : []
  return {
    collection: 'quizzes',
    refKey: ctx.refKey(r.kind, r.wpId),
    kind: r.kind,
    wpId: r.wpId,
    mapper: i.mapper,
    fields: {
      title,
      course: i.course,
      lesson: i.lesson ?? undefined,
      status: 'draft',
      descriptionHtml: sanitiseWpHtml(str(r, 'post_content')).html ?? undefined,
      questions: i.questions.map((q) => ({ question: { $ref: q.refKey }, points: q.fields.points })),
      required: i.required,
      passMark,
      attemptsLimit: attemptsLimit ?? undefined,
      timeLimitMin: timeLimitMin ?? undefined,
    },
    dependsOn: [i.course.$ref, ...lessonDeps, ...i.questions.map((q) => q.refKey)],
    precedence: 10,
  }
}

/** Option text that means "true" in a true/false question (English or Persian labels). */
export function isTrueLabel(label: string): boolean | null {
  const t = label.trim().toLowerCase()
  if (['true', 'درست', 'صحیح', 'بله', 'yes'].includes(t)) return true
  if (['false', 'نادرست', 'غلط', 'خیر', 'no'].includes(t)) return false
  return null
}
