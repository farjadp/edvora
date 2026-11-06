/** Course progress as a whole percent (0–100). */
export function courseProgress(completedLessonIds: readonly string[], allLessonIds: readonly string[]): number {
  if (allLessonIds.length === 0) return 0
  const all = new Set(allLessonIds)
  const done = new Set(completedLessonIds.filter((id) => all.has(id)))
  return Math.round((done.size / all.size) * 100)
}

export type CertificateEligibility = { eligible: true } | { eligible: false; reason: 'progress' | 'defense' }

/** A certificate is issued only after all lessons are done AND the final defense passed. */
export function certificateEligibility(input: {
  progress: number
  defensePassed: boolean
  requiresDefense: boolean
}): CertificateEligibility {
  if (input.progress < 100) return { eligible: false, reason: 'progress' }
  if (input.requiresDefense && !input.defensePassed) return { eligible: false, reason: 'defense' }
  return { eligible: true }
}
