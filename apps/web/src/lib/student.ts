import 'server-only'
import type { Course, Quiz, QuizAttempt, Tenant, User } from '../payload-types'
import { findEnrollment, loadCourseState, type CourseState, type QuizStatus } from './learning'
import { idOf } from './ids'
import { getPayloadClient } from './payload'
import { getCourseBySlug } from './queries'
import { getCurrentUser } from './session'
import { getStaff } from './staff'
import { getCurrentTenant } from './tenant'

export type StudentCourse = { tenant: Tenant; course: Course; user: User; state: CourseState }

/**
 * The signed-in student's live enrollment in a published course of this academy, with its computed state.
 * Null = not signed in, not enrolled, cancelled, or another academy's course (callers answer 404 / login).
 */
export async function studentCourse(courseSlug: string): Promise<StudentCourse | null> {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()])
  if (!user) return null
  const course = await getCourseBySlug(tenant.id, courseSlug)
  if (!course) return null
  const payload = await getPayloadClient()
  const enrollment = await findEnrollment({ payload }, tenant.id, user.id, course.id)
  if (!enrollment) return null
  const state = await loadCourseState({ payload }, { tenantId: tenant.id, course, enrollment })
  return { tenant, course, user, state }
}

/** R6: staff holding lessons.edit or submissions.grade for this course may open locked lessons (preview). */
export async function staffCanPreview(tenantId: number, courseId: number): Promise<boolean> {
  const staff = await getStaff()
  if (!staff) return false
  const target = { courseId, cohortId: undefined }
  return (await staff.can(tenantId, 'lessons.edit', target)) || (await staff.can(tenantId, 'submissions.grade', { courseId, cohortId: null }))
}

export type StudentQuiz = StudentCourse & { quiz: Quiz; status: QuizStatus }

/** A published quiz of the student's course, with its status. Null for drafts, other courses or academies. */
export async function studentQuiz(courseSlug: string, quizId: number): Promise<StudentQuiz | null> {
  const ctx = await studentCourse(courseSlug)
  if (!ctx) return null
  const status = ctx.state.quizzes.find((s) => s.quiz.id === quizId)
  if (!status) return null
  return { ...ctx, quiz: status.quiz, status }
}

/** Loads an attempt for the signed-in student only (tenant + owner), with fresh quiz status. */
export async function studentAttempt(attemptId: number): Promise<(StudentQuiz & { attempt: QuizAttempt }) | null> {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()])
  if (!user) return null
  const payload = await getPayloadClient()
  const attempt = await payload.findByID({ collection: 'quiz-attempts', id: attemptId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!attempt || idOf(attempt.tenant) !== tenant.id || idOf(attempt.user) !== user.id) return null
  const course = await payload.findByID({ collection: 'courses', id: idOf(attempt.course)!, depth: 0, overrideAccess: true, disableErrors: true })
  if (!course || idOf(course.tenant) !== tenant.id) return null
  const ctx = await studentQuiz(course.slug, idOf(attempt.quiz)!)
  if (!ctx) return null
  const fresh = ctx.status.attempts.find((a) => a.id === attempt.id) ?? attempt
  return { ...ctx, attempt: fresh }
}

