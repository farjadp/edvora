/**
 * Quiz attempts on the server (phase-2 §Q3–Q7). The server clock is the only authority on time; correct answers
 * never leave this module except through `buildReview` at the level the quiz allows.
 */
import {
  attemptDeadline,
  buildReview,
  buildSnapshot,
  gradeAttempt,
  isExpired,
  publicQuestions,
  QUIZ_GRACE_MS,
  reviewLevel,
  sanitizeAnswers,
  startDecision,
  type Answers,
  type AttemptReview,
  type BankQuestion,
  type CountedAttempt,
  type FullReviewWhen,
  type PublicQuestion,
  type QuizSnapshot,
  type ReviewMode,
} from '@edvora/core'
import type { Payload, PayloadRequest } from 'payload'
import type { Enrollment, Question, Quiz, QuizAttempt } from '../payload-types'
import { idOf } from './ids'

type Ctx = { payload: Payload; req?: PayloadRequest }

export class QuizError extends Error {
  constructor(
    readonly code: 'not_found' | 'locked' | 'no_attempts' | 'passed' | 'closed',
    message: string,
  ) {
    super(message)
  }
}

const asSnapshot = (v: unknown): QuizSnapshot => {
  const s = v as QuizSnapshot | null | undefined
  return s && Array.isArray(s.questions) ? s : { questions: [] }
}
const asAnswers = (v: unknown): Answers => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Answers) : {})

/** Grades and closes an attempt with the given (already accepted) answers. */
async function finalize(ctx: Ctx, attempt: QuizAttempt, quiz: Quiz, answers: Answers, status: 'submitted' | 'auto_submitted', submittedAt: Date): Promise<QuizAttempt> {
  const snapshot = asSnapshot(attempt.snapshot)
  const grade = gradeAttempt(snapshot, answers, { passMark: quiz.passMark, partialCredit: Boolean(quiz.partialCredit) })
  return ctx.payload.update({
    collection: 'quiz-attempts',
    id: attempt.id,
    overrideAccess: true,
    req: ctx.req,
    data: { status, answers, score: grade.score, maxScore: grade.maxScore, passed: grade.passed, submittedAt: submittedAt.toISOString() },
  })
}

/** Q5: an in-progress attempt past its deadline (+ grace) is closed with its saved answers, whenever it is next read. */
export async function closeExpiredAttempts(ctx: Ctx, attempts: QuizAttempt[], quizzes: Map<number, Quiz>, now: Date): Promise<QuizAttempt[]> {
  return Promise.all(
    attempts.map(async (a) => {
      if (a.status !== 'in_progress' || !isExpired(a.deadlineAt, now)) return a
      const quiz = quizzes.get(idOf(a.quiz) ?? -1) ?? (await ctx.payload.findByID({ collection: 'quizzes', id: idOf(a.quiz)!, depth: 0, overrideAccess: true, req: ctx.req }))
      return finalize(ctx, a, quiz, asAnswers(a.answers), 'auto_submitted', new Date(a.deadlineAt!))
    }),
  )
}

async function loadBank(ctx: Ctx, quiz: Quiz): Promise<{ question: BankQuestion; points?: number | null }[]> {
  const ids = (quiz.questions ?? []).map((q) => idOf(q.question)).filter((x): x is number => x !== null)
  if (ids.length === 0) return []
  const res = await ctx.payload.find({ collection: 'questions', where: { id: { in: ids } }, depth: 0, limit: ids.length, pagination: false, overrideAccess: true, req: ctx.req })
  const byId = new Map(res.docs.map((q) => [q.id, q]))
  return (quiz.questions ?? []).flatMap((row) => {
    const q: Question | undefined = byId.get(idOf(row.question) ?? -1)
    if (!q || idOf(q.course) !== idOf(quiz.course)) return []
    return [
      {
        question: {
          id: q.id,
          type: q.type,
          text: q.text,
          points: q.points,
          options: (q.options ?? []).map((o) => ({ id: o.id ?? null, text: o.text, isCorrect: o.isCorrect })),
          correctAnswer: q.correctAnswer ?? null,
          acceptedAnswers: q.acceptedAnswers ?? [],
          explanation: q.explanation ?? null,
        },
        points: row.points ?? null,
      },
    ]
  })
}

const isUniqueViolation = (err: unknown) => /unique|duplicate/i.test(String((err as { message?: string })?.message ?? err)) || (err as { code?: string })?.code === '23505'

/**
 * Starts a new attempt, or returns the in-progress one (Q3: only one at a time; reload resumes).
 * The (quiz, user, attemptNo) unique index makes two racing tabs end up on the same attempt (Q6).
 */
export async function startAttempt(
  ctx: Ctx,
  input: { tenantId: number; quiz: Quiz; enrollment: Enrollment; attempts: QuizAttempt[]; extraAttempts: number; now?: Date },
): Promise<QuizAttempt> {
  const now = input.now ?? new Date()
  const userId = idOf(input.enrollment.user)!
  const decision = startDecision({
    attempts: input.attempts,
    attemptsLimit: input.quiz.attemptsLimit,
    extraAttempts: input.extraAttempts,
    countedMode: (input.quiz.countedAttempt ?? 'best') as CountedAttempt,
    allowRetakeAfterPass: Boolean(input.quiz.allowRetakeAfterPass),
  })
  if (!decision.ok) throw new QuizError(decision.reason, decision.reason === 'passed' ? 'این آزمون را قبول شده‌اید.' : 'فرصت دیگری برای این آزمون ندارید.')
  if (decision.resume) return input.attempts.find((a) => a.status === 'in_progress')!

  const bank = await loadBank(ctx, input.quiz)
  if (bank.length === 0) throw new QuizError('not_found', 'این آزمون هنوز سؤالی ندارد.')
  const snapshot = buildSnapshot(bank, { shuffle: Boolean(input.quiz.shuffle) })
  const deadline = attemptDeadline(now, input.quiz.timeLimitMin)
  try {
    return await ctx.payload.create({
      collection: 'quiz-attempts',
      overrideAccess: true,
      req: ctx.req,
      data: {
        tenant: input.tenantId,
        quiz: input.quiz.id,
        user: userId,
        enrollment: input.enrollment.id,
        course: idOf(input.quiz.course)!,
        cohort: idOf(input.enrollment.cohort),
        attemptNo: decision.attemptNo,
        status: 'in_progress',
        startedAt: now.toISOString(),
        deadlineAt: deadline?.toISOString() ?? null,
        answers: {},
        snapshot,
      },
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const again = await ctx.payload.find({
      collection: 'quiz-attempts',
      where: { and: [{ quiz: { equals: input.quiz.id } }, { user: { equals: userId } }, { attemptNo: { equals: decision.attemptNo } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: ctx.req,
    })
    if (again.docs[0]) return again.docs[0]
    throw err
  }
}

/** Autosave. Refused once the server deadline (+ grace) has passed; the attempt is then closed. */
export async function saveAnswers(ctx: Ctx, attempt: QuizAttempt, quiz: Quiz, raw: unknown, now = new Date()): Promise<QuizAttempt> {
  if (attempt.status !== 'in_progress') throw new QuizError('closed', 'این تلاش قبلاً ارسال شده است.')
  if (isExpired(attempt.deadlineAt, now)) {
    await finalize(ctx, attempt, quiz, asAnswers(attempt.answers), 'auto_submitted', new Date(attempt.deadlineAt!))
    throw new QuizError('closed', 'زمان آزمون تمام شد.')
  }
  const answers = sanitizeAnswers(asSnapshot(attempt.snapshot), raw)
  return ctx.payload.update({ collection: 'quiz-attempts', id: attempt.id, overrideAccess: true, req: ctx.req, data: { answers } })
}

/**
 * Submit (idempotent: a finished attempt is returned unchanged). Answers that arrive after the deadline + grace are
 * ignored; the attempt is graded from what was saved and counts as used (Q5).
 */
export async function submitAttempt(ctx: Ctx, attempt: QuizAttempt, quiz: Quiz, raw: unknown, now = new Date()): Promise<QuizAttempt> {
  if (attempt.status !== 'in_progress') return attempt
  if (isExpired(attempt.deadlineAt, now)) return finalize(ctx, attempt, quiz, asAnswers(attempt.answers), 'auto_submitted', new Date(attempt.deadlineAt!))
  const answers = raw === undefined ? asAnswers(attempt.answers) : sanitizeAnswers(asSnapshot(attempt.snapshot), raw)
  const timeUp = attempt.deadlineAt != null && now.getTime() > new Date(attempt.deadlineAt).getTime()
  return finalize(ctx, attempt, quiz, answers, timeUp ? 'auto_submitted' : 'submitted', now)
}

/** The in-progress attempt as the browser may see it: questions without answers, saved answers, server times. */
export type AttemptPlay = {
  attemptId: number
  attemptNo: number
  questions: PublicQuestion[]
  answers: Answers
  deadlineAt: string | null
  serverNow: string
  graceMs: number
}

export function playView(attempt: QuizAttempt, now = new Date()): AttemptPlay {
  return {
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    questions: publicQuestions(asSnapshot(attempt.snapshot)),
    answers: asAnswers(attempt.answers),
    deadlineAt: attempt.deadlineAt ?? null,
    serverNow: now.toISOString(),
    graceMs: QUIZ_GRACE_MS,
  }
}

/** Q7: result payload for a finished attempt at the level the quiz allows right now. */
export function resultView(attempt: QuizAttempt, quiz: Quiz, status: { passed: boolean; attemptsLeft: number | null }): AttemptReview {
  const snapshot = asSnapshot(attempt.snapshot)
  const answers = asAnswers(attempt.answers)
  const grade = gradeAttempt(snapshot, answers, { passMark: quiz.passMark, partialCredit: Boolean(quiz.partialCredit) })
  const level = reviewLevel({
    review: (quiz.review ?? 'wrongRight') as ReviewMode,
    fullWhen: (quiz.fullReviewWhen ?? 'always') as FullReviewWhen,
    passed: status.passed,
    attemptsLeft: status.attemptsLeft,
  })
  // The stored score is authoritative (grading rules could change later); the review shows per-question detail.
  return { ...buildReview(snapshot, answers, grade, level), ...(level === 'none' ? {} : { score: attempt.score ?? grade.score, maxScore: attempt.maxScore ?? grade.maxScore }), passed: Boolean(attempt.passed) }
}
