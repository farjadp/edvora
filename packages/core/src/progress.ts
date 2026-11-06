/** Course progress as a whole percent (0–100). */
export function courseProgress(completedLessonIds: readonly string[], allLessonIds: readonly string[]): number {
  if (allLessonIds.length === 0) return 0
  const all = new Set(allLessonIds)
  const done = new Set(completedLessonIds.filter((id) => all.has(id)))
  return Math.round((done.size / all.size) * 100)
}

/**
 * A required quiz (Q8) or assignment (C6).
 * - `done`: quiz passed / assignment graded with score ≥ pass score
 * - `pending`: not attempted, in progress, submitted but not graded
 * - `failed`: quiz attempts used up, or assignment graded below the pass score
 * - `unreleased`: belongs to a drip-locked lesson — "not yet released", not "missing" (R8)
 */
export type RequirementState = 'done' | 'pending' | 'failed' | 'unreleased'
export type Requirement = { kind: 'quiz' | 'assignment'; id: string; title: string; state: RequirementState; lessonId?: string | null }

export type EligibilityReason = 'progress' | 'quiz' | 'assignment' | 'defense'
export type CertificateEligibility = { eligible: true } | { eligible: false; reason: EligibilityReason; missing: EligibilityReason[] }

/**
 * A certificate is issued only after all lessons are done, every required quiz is passed, every required
 * assignment is passed, AND (if the course requires it) the final defense passed. `reason` is the first gate that
 * fails; `missing` lists all of them so the panel can show what is left.
 */
export function certificateEligibility(input: {
  progress: number
  defensePassed: boolean
  requiresDefense: boolean
  requirements?: readonly Requirement[]
}): CertificateEligibility {
  const missing: EligibilityReason[] = []
  if (input.progress < 100) missing.push('progress')
  const open = (input.requirements ?? []).filter((r) => r.state !== 'done')
  if (open.some((r) => r.kind === 'quiz')) missing.push('quiz')
  if (open.some((r) => r.kind === 'assignment')) missing.push('assignment')
  if (input.requiresDefense && !input.defensePassed) missing.push('defense')
  return missing.length === 0 ? { eligible: true } : { eligible: false, reason: missing[0]!, missing }
}

/** A lesson is added to `completedLessons` only when its required quiz/assignment is done (Q8). */
export function lessonCompletionBlockers(requirements: readonly Requirement[], lessonId: string): Requirement[] {
  return requirements.filter((r) => r.lessonId != null && String(r.lessonId) === lessonId && r.state !== 'done')
}

export function quizRequirementState(input: { released: boolean; passed: boolean; attemptsLeft: number | null; hasInProgress: boolean }): RequirementState {
  if (!input.released) return 'unreleased'
  if (input.passed) return 'done'
  if (input.attemptsLeft === 0 && !input.hasInProgress) return 'failed'
  return 'pending'
}

export function assignmentRequirementState(input: { released: boolean; score: number | null | undefined; passScore?: number | null }): RequirementState {
  if (!input.released) return 'unreleased'
  if (input.score == null) return 'pending'
  return input.passScore == null || input.score >= input.passScore ? 'done' : 'failed'
}
