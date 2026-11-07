/**
 * Quizzes (phase-2 §Q). Pure functions: grading, attempt rules, review payloads.
 * The server snapshots questions into each attempt; everything here works on that snapshot.
 * Client components may import this file (`@edvora/core/quiz`): it has no Node dependencies.
 */
import { toLatinDigits } from './digits'

export type QuestionType = 'single' | 'multiple' | 'trueFalse' | 'short'
export const QUESTION_TYPES: readonly QuestionType[] = ['single', 'multiple', 'trueFalse', 'short']

export type SnapshotOption = { id: string; text: string; correct: boolean }

/** One question as it was when the attempt started (Q2: later edits never change past attempts). */
export type SnapshotQuestion = {
  id: string
  type: QuestionType
  text: string
  points: number
  /** single / multiple / trueFalse (true-false is stored as two options with ids `true` and `false`). */
  options: SnapshotOption[]
  /** short answer only. */
  acceptedAnswers: string[]
  /** Lexical rich text (or legacy plain text in old snapshots). */
  explanation?: unknown
}

export type QuizSnapshot = { questions: SnapshotQuestion[] }

/** A student's answer. `optionIds` for choice types, `text` for short answer. */
export type Answer = { optionIds?: string[]; text?: string }
export type Answers = Record<string, Answer>

export type CountedAttempt = 'best' | 'last'
export type ReviewMode = 'none' | 'score' | 'wrongRight' | 'full'
export type FullReviewWhen = 'always' | 'afterPass' | 'afterLastAttempt'

export type GradeOptions = { partialCredit?: boolean }

/** Seconds of grace after the deadline during which answers are still accepted (Q5, client to confirm). */
export const QUIZ_GRACE_MS = 10_000

const round2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- Authoring validation (Q1)

export type QuestionDraft = {
  type: QuestionType
  text?: string | null
  points?: number | null
  options?: { text?: string | null; isCorrect?: boolean | null }[] | null
  correctAnswer?: 'true' | 'false' | null
  acceptedAnswers?: { answer?: string | null }[] | null
}

export type FieldError = { path: string; message: string }

/** Persian field errors for a question; empty = valid. */
export function validateQuestion(q: QuestionDraft): FieldError[] {
  const errors: FieldError[] = []
  if (!q.text?.trim()) errors.push({ path: 'text', message: 'متن سؤال را بنویسید.' })
  if (typeof q.points !== 'number' || !Number.isFinite(q.points) || q.points <= 0) {
    errors.push({ path: 'points', message: 'امتیاز سؤال باید بیشتر از صفر باشد.' })
  }
  const options = (q.options ?? []).filter((o) => o.text?.trim())
  const correct = options.filter((o) => o.isCorrect).length
  if (q.type === 'single') {
    if (options.length < 2) errors.push({ path: 'options', message: 'سؤال تک‌گزینه‌ای دست‌کم دو گزینه لازم دارد.' })
    else if (correct !== 1) errors.push({ path: 'options', message: 'سؤال تک‌گزینه‌ای باید دقیقاً یک گزینهٔ درست داشته باشد.' })
  } else if (q.type === 'multiple') {
    if (options.length < 2) errors.push({ path: 'options', message: 'سؤال چندگزینه‌ای دست‌کم دو گزینه لازم دارد.' })
    else if (correct < 1) errors.push({ path: 'options', message: 'دست‌کم یک گزینه را درست علامت بزنید.' })
  } else if (q.type === 'trueFalse') {
    if (q.correctAnswer !== 'true' && q.correctAnswer !== 'false') errors.push({ path: 'correctAnswer', message: 'پاسخ درست (درست/نادرست) را انتخاب کنید.' })
  } else if (q.type === 'short') {
    if (!(q.acceptedAnswers ?? []).some((a) => normalizeShortAnswer(a.answer ?? '') !== '')) {
      errors.push({ path: 'acceptedAnswers', message: 'دست‌کم یک پاسخ پذیرفته‌شده بنویسید.' })
    }
  }
  return errors
}

export type QuizDraft = {
  questionCount: number
  passMark?: number | null
  timeLimitMin?: number | null
  attemptsLimit?: number | null
}

export function validateQuiz(q: QuizDraft): FieldError[] {
  const errors: FieldError[] = []
  if (q.questionCount < 1) errors.push({ path: 'questions', message: 'آزمون دست‌کم یک سؤال لازم دارد.' })
  if (typeof q.passMark !== 'number' || !Number.isInteger(q.passMark) || q.passMark < 1 || q.passMark > 100) {
    errors.push({ path: 'passMark', message: 'نمرهٔ قبولی باید عددی صحیح بین ۱ تا ۱۰۰ درصد باشد.' })
  }
  if (q.timeLimitMin != null && (!Number.isFinite(q.timeLimitMin) || q.timeLimitMin <= 0)) {
    errors.push({ path: 'timeLimitMin', message: 'محدودیت زمان باید بیشتر از صفر دقیقه باشد (یا خالی بماند).' })
  }
  if (q.attemptsLimit != null && (!Number.isInteger(q.attemptsLimit) || q.attemptsLimit < 1)) {
    errors.push({ path: 'attemptsLimit', message: 'تعداد دفعات مجاز باید عددی صحیح و دست‌کم ۱ باشد (یا خالی بماند).' })
  }
  return errors
}

// ---------------------------------------------------------------- Snapshot

export type BankQuestion = {
  id: string | number
  type: QuestionType
  text: string
  points: number
  options?: { id?: string | null; text: string; isCorrect?: boolean | null }[] | null
  correctAnswer?: 'true' | 'false' | null
  acceptedAnswers?: { answer?: string | null }[] | null
  /** Lexical rich text (or legacy plain text in old snapshots). */
  explanation?: unknown
}

export const TRUE_FALSE_LABELS = { true: 'درست', false: 'نادرست' } as const

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Freezes the quiz's questions (with per-quiz points) into an attempt. Shuffle happens once, here. */
export function buildSnapshot(
  items: readonly { question: BankQuestion; points?: number | null }[],
  opts: { shuffle?: boolean; rng?: () => number } = {},
): QuizSnapshot {
  const rng = opts.rng ?? Math.random
  const questions = items.map(({ question: q, points }): SnapshotQuestion => {
    let options: SnapshotOption[] = []
    if (q.type === 'trueFalse') {
      options = (['true', 'false'] as const).map((id) => ({ id, text: TRUE_FALSE_LABELS[id], correct: q.correctAnswer === id }))
    } else if (q.type !== 'short') {
      options = (q.options ?? [])
        .filter((o) => o.text?.trim())
        .map((o, i) => ({ id: o.id ? String(o.id) : `o${i + 1}`, text: o.text, correct: Boolean(o.isCorrect) }))
      if (opts.shuffle) options = shuffled(options, rng)
    }
    return {
      id: String(q.id),
      type: q.type,
      text: q.text,
      points: typeof points === 'number' && points > 0 ? points : q.points,
      options,
      acceptedAnswers: q.type === 'short' ? (q.acceptedAnswers ?? []).map((a) => a.answer ?? '').filter((a) => normalizeShortAnswer(a) !== '') : [],
      explanation: q.explanation ?? null,
    }
  })
  return { questions: opts.shuffle ? shuffled(questions, rng) : questions }
}

/** What the student's browser may see before submitting: no correct flags, no accepted answers, no explanations (Q7). */
export type PublicQuestion = { id: string; type: QuestionType; text: string; points: number; options: { id: string; text: string }[] }

export function publicQuestions(snapshot: QuizSnapshot): PublicQuestion[] {
  return snapshot.questions.map((q) => ({ id: q.id, type: q.type, text: q.text, points: q.points, options: q.options.map((o) => ({ id: o.id, text: o.text })) }))
}

// ---------------------------------------------------------------- Grading (Q4)

/**
 * Short-answer normalisation: Persian/Arabic digits → Latin, Arabic ي/ى/ك → Persian ی/ک, tatweel and Arabic
 * diacritics removed, ZWNJ treated as a space, whitespace collapsed and trimmed, Latin letters lower-cased.
 */
export function normalizeShortAnswer(input: string): string {
  return toLatinDigits(input)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[‌ ]/g, ' ')
    .replace(/[​‍‎‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Points earned on one question. Unanswered = 0, never negative. */
export function gradeQuestion(q: SnapshotQuestion, answer: Answer | undefined, opts: GradeOptions = {}): number {
  if (!answer) return 0
  if (q.type === 'short') {
    const given = normalizeShortAnswer(answer.text ?? '')
    if (!given) return 0
    return q.acceptedAnswers.some((a) => normalizeShortAnswer(a) === given) ? q.points : 0
  }
  const picked = new Set((answer.optionIds ?? []).filter((id) => q.options.some((o) => o.id === id)))
  if (picked.size === 0) return 0
  const right = q.options.filter((o) => o.correct)
  if (q.type === 'single' || q.type === 'trueFalse') {
    if (picked.size !== 1) return 0
    return right.some((o) => picked.has(o.id)) ? q.points : 0
  }
  // multiple
  const rightPicked = right.filter((o) => picked.has(o.id)).length
  const wrongPicked = picked.size - rightPicked
  if (!opts.partialCredit) return rightPicked === right.length && wrongPicked === 0 ? q.points : 0
  if (right.length === 0) return 0
  return round2(Math.max(0, (rightPicked - wrongPicked) / right.length) * q.points)
}

export type QuestionResult = { id: string; earned: number; points: number; correct: boolean; answered: boolean }
export type AttemptGrade = { score: number; maxScore: number; passed: boolean; questions: QuestionResult[] }

/** `passed = score ≥ passMark% × total`. */
export function isPassing(score: number, maxScore: number, passMark: number): boolean {
  if (maxScore <= 0) return false
  // score × 100 ≥ passMark × maxScore, compared as rounded integers (scores have ≤ 2 decimals) to avoid float edge cases.
  return Math.round(score * 10_000) >= Math.round(passMark * maxScore * 100)
}

export function gradeAttempt(snapshot: QuizSnapshot, answers: Answers, opts: GradeOptions & { passMark: number }): AttemptGrade {
  const questions = snapshot.questions.map((q): QuestionResult => {
    const a = answers[q.id]
    const earned = gradeQuestion(q, a, opts)
    const answered = Boolean(a && ((a.optionIds?.length ?? 0) > 0 || (a.text ?? '').trim() !== ''))
    return { id: q.id, earned, points: q.points, correct: earned >= q.points, answered }
  })
  const score = round2(questions.reduce((s, q) => s + q.earned, 0))
  const maxScore = round2(snapshot.questions.reduce((s, q) => s + q.points, 0))
  return { score, maxScore, passed: isPassing(score, maxScore, opts.passMark), questions }
}

// ---------------------------------------------------------------- Attempts (Q5, Q6)

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted'

export type AttemptRecord = {
  attemptNo: number
  status: AttemptStatus
  score?: number | null
  maxScore?: number | null
  passed?: boolean | null
  startedAt: string | Date
  deadlineAt?: string | Date | null
  submittedAt?: string | Date | null
}

const time = (d: string | Date) => new Date(d).getTime()

export const isFinished = (a: Pick<AttemptRecord, 'status'>) => a.status !== 'in_progress'

/** Unlimited = null. Extra attempts are granted by staff per student (Q6). */
export function allowedAttempts(limit: number | null | undefined, extra = 0): number | null {
  if (limit == null || limit <= 0) return null
  return limit + Math.max(0, Math.floor(extra))
}

/** The attempt that decides score/passed: best (highest score, earliest on ties) or last submitted. */
export function countedAttempt<T extends AttemptRecord>(attempts: readonly T[], mode: CountedAttempt): T | null {
  const done = attempts.filter(isFinished)
  if (done.length === 0) return null
  if (mode === 'last') {
    return done.reduce((a, b) => (time(b.submittedAt ?? b.startedAt) > time(a.submittedAt ?? a.startedAt) || (time(b.submittedAt ?? b.startedAt) === time(a.submittedAt ?? a.startedAt) && b.attemptNo > a.attemptNo) ? b : a))
  }
  return done.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a))
}

/** Deadline of an attempt started at `startedAt`, or null without a time limit. */
export function attemptDeadline(startedAt: Date, timeLimitMin: number | null | undefined): Date | null {
  if (!timeLimitMin || timeLimitMin <= 0) return null
  return new Date(startedAt.getTime() + Math.round(timeLimitMin * 60_000))
}

/** An in-progress attempt whose deadline (+ grace) has passed is closed with its saved answers. */
export function isExpired(deadlineAt: string | Date | null | undefined, now: Date, graceMs = QUIZ_GRACE_MS): boolean {
  return deadlineAt != null && now.getTime() > time(deadlineAt) + graceMs
}

export type StartDecision =
  | { ok: true; resume: true; attemptNo: number }
  | { ok: true; resume: false; attemptNo: number }
  | { ok: false; reason: 'no_attempts' | 'passed' }

/**
 * May the student start (or resume) an attempt? Expired in-progress attempts must be closed by the caller first.
 * The returned attemptNo is unique per quiz+user; the database enforces it, so two racing tabs cannot both start.
 */
export function startDecision(input: {
  attempts: readonly AttemptRecord[]
  attemptsLimit?: number | null
  extraAttempts?: number
  countedMode: CountedAttempt
  allowRetakeAfterPass?: boolean
}): StartDecision {
  const open = input.attempts.find((a) => a.status === 'in_progress')
  if (open) return { ok: true, resume: true, attemptNo: open.attemptNo }
  const counted = countedAttempt(input.attempts, input.countedMode)
  if (counted?.passed && !input.allowRetakeAfterPass) return { ok: false, reason: 'passed' }
  const allowed = allowedAttempts(input.attemptsLimit, input.extraAttempts)
  const used = input.attempts.length
  if (allowed !== null && used >= allowed) return { ok: false, reason: 'no_attempts' }
  const next = input.attempts.reduce((m, a) => Math.max(m, a.attemptNo), 0) + 1
  return { ok: true, resume: false, attemptNo: next }
}

export function attemptsLeft(used: number, attemptsLimit: number | null | undefined, extra = 0): number | null {
  const allowed = allowedAttempts(attemptsLimit, extra)
  return allowed === null ? null : Math.max(0, allowed - used)
}

/** Merge a save into stored answers, keeping only questions that exist in the snapshot. */
export function sanitizeAnswers(snapshot: QuizSnapshot, input: unknown): Answers {
  const out: Answers = {}
  if (!input || typeof input !== 'object') return out
  for (const q of snapshot.questions) {
    const raw = (input as Record<string, unknown>)[q.id]
    if (!raw || typeof raw !== 'object') continue
    const a = raw as { optionIds?: unknown; text?: unknown }
    if (q.type === 'short') {
      if (typeof a.text === 'string') out[q.id] = { text: a.text.slice(0, 500) }
    } else if (Array.isArray(a.optionIds)) {
      const ids = [...new Set(a.optionIds.filter((x): x is string => typeof x === 'string' && q.options.some((o) => o.id === x)))]
      out[q.id] = { optionIds: q.type === 'multiple' ? ids : ids.slice(0, 1) }
    }
  }
  return out
}

// ---------------------------------------------------------------- Review (Q7)

/** The review level actually shown: "full" degrades to "wrongRight" until its condition is met. */
export function reviewLevel(input: { review: ReviewMode; fullWhen?: FullReviewWhen | null; passed: boolean; attemptsLeft: number | null }): ReviewMode {
  if (input.review !== 'full') return input.review
  const when = input.fullWhen ?? 'always'
  if (when === 'afterPass' && !input.passed) return 'wrongRight'
  if (when === 'afterLastAttempt' && !input.passed && input.attemptsLeft !== 0) return 'wrongRight'
  return 'full'
}

export type ReviewQuestion = PublicQuestion & {
  myOptionIds: string[]
  myText: string
  /** Only from level `wrongRight`. */
  correct?: boolean
  earned?: number
  /** Only at level `full`. */
  correctOptionIds?: string[]
  acceptedAnswers?: string[]
  /** Lexical rich text (or legacy plain text in old snapshots). */
  explanation?: unknown
}

export type AttemptReview = {
  level: ReviewMode
  score?: number
  maxScore?: number
  passed?: boolean
  questions: ReviewQuestion[]
}

/**
 * The result payload sent to the browser. Fields above the allowed level are absent, not just hidden.
 * Level `none` still tells the student whether they passed (completion depends on it) but no score or details.
 */
export function buildReview(snapshot: QuizSnapshot, answers: Answers, grade: AttemptGrade, level: ReviewMode): AttemptReview {
  const base = publicQuestions(snapshot)
  if (level === 'none') return { level, passed: grade.passed, questions: [] }
  if (level === 'score') return { level, score: grade.score, maxScore: grade.maxScore, passed: grade.passed, questions: [] }
  const questions = base.map((q, i): ReviewQuestion => {
    const full = snapshot.questions[i]!
    const r = grade.questions[i]!
    const a = answers[q.id]
    const out: ReviewQuestion = { ...q, myOptionIds: a?.optionIds ?? [], myText: a?.text ?? '', correct: r.correct, earned: r.earned }
    if (level === 'full') {
      out.correctOptionIds = full.options.filter((o) => o.correct).map((o) => o.id)
      out.acceptedAnswers = full.acceptedAnswers
      out.explanation = full.explanation ?? null
    }
    return out
  })
  return { level, score: grade.score, maxScore: grade.maxScore, passed: grade.passed, questions }
}
