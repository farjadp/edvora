/**
 * A student's state in one course: drip locks, quizzes, assignments, requirements and certificate eligibility.
 * Computed on every read from the database (phase-2 §R5: unlock times are never stored).
 * No `server-only` / Next imports: collection hooks (certificates) and scripts use it too.
 */
import {
  assignmentRequirementState,
  attemptsLeft,
  certificateEligibility,
  countedAttempt,
  courseProgress,
  lessonCompletionBlockers,
  lessonLocks,
  quizRequirementState,
  submissionWindow,
  type CertificateEligibility,
  type CountedAttempt,
  type LessonLock,
  type LearningRequirement,
  type SubmissionWindow,
} from '@edvora/core'
import type { Payload, PayloadRequest, Where } from 'payload'
import type { Assignment, Cohort, Course, Enrollment, Lesson, Quiz, QuizAttempt, Submission } from '../payload-types'
import { idOf } from './ids'
import { closeExpiredAttempts } from './quizAttempts'

export type QuizStatus = {
  quiz: Quiz
  attempts: QuizAttempt[]
  counted: QuizAttempt | null
  passed: boolean
  inProgress: QuizAttempt | null
  attemptsLeft: number | null
  extraAttempts: number
  released: boolean
}

export type AssignmentStatus = {
  assignment: Assignment
  submission: Submission | null
  released: boolean
  window: SubmissionWindow
}

export type CourseState = {
  enrollment: Enrollment
  cohort: Cohort | null
  lessons: Lesson[]
  locks: Map<string, LessonLock>
  completed: Set<number>
  quizzes: QuizStatus[]
  assignments: AssignmentStatus[]
  requirements: LearningRequirement[]
  progress: number
  eligibility: CertificateEligibility
}

type Ctx = { payload: Payload; req?: PayloadRequest }

/** The student's live enrollment in a course of this academy (cancelled = no access at all, R5). */
export async function findEnrollment({ payload, req }: Ctx, tenantId: number, userId: number, courseId: number): Promise<Enrollment | null> {
  const res = await payload.find({
    collection: 'enrollments',
    where: { and: [{ tenant: { equals: tenantId } }, { user: { equals: userId } }, { course: { equals: courseId } }, { status: { not_equals: 'cancelled' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return res.docs[0] ?? null
}

export async function courseLessons({ payload, req }: Ctx, tenantId: number, courseId: number): Promise<Lesson[]> {
  const res = await payload.find({
    collection: 'lessons',
    where: { and: [{ tenant: { equals: tenantId } }, { course: { equals: courseId } }] },
    sort: 'order',
    limit: 500,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return res.docs
}

const extraFor = (enrollment: Enrollment, quizId: number) =>
  (enrollment.quizExtraAttempts ?? []).filter((r) => idOf(r.quiz) === quizId).reduce((s, r) => s + (r.extra ?? 0), 0)

export function quizStatusOf(quiz: Quiz, attempts: QuizAttempt[], enrollment: Enrollment, released: boolean): QuizStatus {
  const mine = attempts.filter((a) => idOf(a.quiz) === quiz.id)
  const counted = countedAttempt(mine, (quiz.countedAttempt ?? 'best') as CountedAttempt)
  const extraAttempts = extraFor(enrollment, quiz.id)
  return {
    quiz,
    attempts: mine,
    counted,
    passed: Boolean(counted?.passed),
    inProgress: mine.find((a) => a.status === 'in_progress') ?? null,
    attemptsLeft: attemptsLeft(mine.length, quiz.attemptsLimit, extraAttempts),
    extraAttempts,
    released,
  }
}

/** Everything the learn pages need, for one student and course. Expired quiz attempts are closed on the way. */
export async function loadCourseState(ctx: Ctx, input: { tenantId: number; course: Pick<Course, 'id' | 'requiresDefense'>; enrollment: Enrollment; now?: Date }): Promise<CourseState> {
  const { payload, req } = ctx
  const { tenantId, course, enrollment } = input
  const now = input.now ?? new Date()
  const userId = idOf(enrollment.user)!
  const cohortId = idOf(enrollment.cohort)
  const inCourse: Where[] = [{ tenant: { equals: tenantId } }, { course: { equals: course.id } }]

  const [lessons, cohort, quizzes, assignments, attemptsRes, submissionsRes] = await Promise.all([
    courseLessons(ctx, tenantId, course.id),
    cohortId ? payload.findByID({ collection: 'cohorts', id: cohortId, depth: 0, overrideAccess: true, req, disableErrors: true }) : Promise.resolve(null),
    payload.find({ collection: 'quizzes', where: { and: [...inCourse, { status: { equals: 'published' } }] }, depth: 0, limit: 200, pagination: false, overrideAccess: true, req }),
    payload.find({
      collection: 'assignments',
      where: {
        and: [
          ...inCourse,
          { status: { equals: 'published' } },
          { or: [{ cohort: { exists: false } }, ...(cohortId ? [{ cohort: { equals: cohortId } }] : [])] },
        ],
      },
      sort: 'dueAt',
      depth: 1,
      limit: 200,
      pagination: false,
      overrideAccess: true,
      req,
    }),
    payload.find({ collection: 'quiz-attempts', where: { and: [...inCourse, { user: { equals: userId } }] }, depth: 0, limit: 1000, pagination: false, overrideAccess: true, req }),
    payload.find({ collection: 'submissions', where: { and: [...inCourse, { user: { equals: userId } }] }, depth: 1, limit: 200, pagination: false, overrideAccess: true, req }),
  ])

  const quizById = new Map(quizzes.docs.map((q) => [q.id, q]))
  const attempts = await closeExpiredAttempts(ctx, attemptsRes.docs, quizById, now)

  const completed = new Set((enrollment.completedLessons ?? []).map((l) => idOf(l)).filter((x): x is number => x !== null))
  const locks = lessonLocks(
    lessons.map((l) => ({ id: l.id, order: l.order, isFreePreview: l.isFreePreview, drip: l.drip ?? null })),
    {
      enrolledAt: enrollment.enrolledAt ?? enrollment.createdAt,
      cohortStart: cohort?.startDate ?? null,
      completed,
      opened: (enrollment.openedLessons ?? []).map((l) => idOf(l)).filter((x): x is number => x !== null),
      now,
    },
  )
  const releasedLesson = (lesson: unknown) => {
    const id = idOf(lesson)
    return id === null || locks.get(String(id))?.state === 'open'
  }

  const quizStatuses = quizzes.docs.map((q) => quizStatusOf(q, attempts, enrollment, releasedLesson(q.lesson)))
  const assignmentStatuses = assignments.docs.map((a): AssignmentStatus => {
    const submission = submissionsRes.docs.find((s) => idOf(s.assignment) === a.id) ?? null
    return {
      assignment: a,
      submission,
      released: releasedLesson(a.lesson),
      window: submissionWindow({ dueAt: a.dueAt, allowLate: a.allowLate, graded: submission?.score != null, now }),
    }
  })

  const requirements: LearningRequirement[] = [
    ...quizStatuses
      .filter((s) => s.quiz.required)
      .map((s): LearningRequirement => ({
        kind: 'quiz',
        id: String(s.quiz.id),
        title: s.quiz.title,
        lessonId: idOf(s.quiz.lesson) === null ? null : String(idOf(s.quiz.lesson)),
        state: quizRequirementState({ released: s.released, passed: s.passed, attemptsLeft: s.attemptsLeft, hasInProgress: Boolean(s.inProgress) }),
      })),
    ...assignmentStatuses
      .filter((s) => s.assignment.required)
      .map((s): LearningRequirement => ({
        kind: 'assignment',
        id: String(s.assignment.id),
        title: s.assignment.title,
        lessonId: idOf(s.assignment.lesson) === null ? null : String(idOf(s.assignment.lesson)),
        state: assignmentRequirementState({ released: s.released, score: s.submission?.score, passScore: s.assignment.passScore }),
      })),
  ]

  const progress = courseProgress([...completed].map(String), lessons.map((l) => String(l.id)))
  return {
    enrollment,
    cohort,
    lessons,
    locks,
    completed,
    quizzes: quizStatuses,
    assignments: assignmentStatuses,
    requirements,
    progress,
    eligibility: certificateEligibility({
      progress,
      defensePassed: Boolean(enrollment.defensePassed),
      requiresDefense: Boolean(course.requiresDefense),
      requirements,
    }),
  }
}

export const blockersFor = (state: CourseState, lessonId: number) => lessonCompletionBlockers(state.requirements, String(lessonId))
