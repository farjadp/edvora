/**
 * Badges, milestones and the certificate path (PRD §3.4, §3.7, G4–G5). The catalogue is code (super-admin edits
 * later, G11). Awards are written once to the ledger (`badge.earned`, unique key) so the date is stable and
 * nothing is awarded twice. XP is never an input to the certificate path: XP does not unlock a certificate.
 * No "Ministry of Science" wording anywhere (DBA claim unverified, Notion 04).
 */
import type { CertificateEligibility, EligibilityReason, LearningRequirement } from '../progress'
import { tehranDayNumber } from './calendar'
import { standingEvents, type LedgerEvent } from './xp'

export type BadgeScope = 'enrollment' | 'lifetime'

export type BadgeDef = {
  key: string
  /** Persian name, half-spaces kept. `[Farjad approves names]` */
  name: string
  /** One line of why. */
  description: string
  scope: BadgeScope
}

/**
 * Starter catalogue. Left out on purpose: «بازخورد را جدی گرفت» (needs resubmission after feedback, not in E-026)
 * and «همیشه حاضر» (needs live-class attendance, Phase 2 D).
 */
export const BADGES = [
  { key: 'first-step', name: 'قدم اول', description: 'اولین جلسه را کامل کردید.', scope: 'lifetime' },
  { key: 'strong-start', name: 'شروع قوی', description: 'سه جلسه در هفتهٔ اول دوره.', scope: 'enrollment' },
  { key: 'weekly-rhythm', name: 'ریتم هفتگی', description: 'سه هفتهٔ پیاپی به هدف هفتگی رسیدید.', scope: 'lifetime' },
  { key: 'steady', name: 'پایدار', description: 'هشت هفتهٔ پیاپی به هدف هفتگی رسیدید.', scope: 'lifetime' },
  { key: 'analyst', name: 'تحلیل‌گر', description: 'اولین آزمون را در تلاش اول با نمرهٔ ۸۰ درصد یا بیشتر قبول شدید.', scope: 'enrollment' },
  { key: 'on-time', name: 'به‌موقع', description: 'سه تکلیف را پیش از مهلت تحویل دادید.', scope: 'enrollment' },
  { key: 'halfway', name: 'نیمهٔ راه', description: 'نیمی از دوره را پشت سر گذاشتید.', scope: 'enrollment' },
  { key: 'finish-line', name: 'خط پایان', description: 'همهٔ جلسه‌ها، آزمون‌ها و تکالیف لازم انجام شد.', scope: 'enrollment' },
  { key: 'ready-for-defense', name: 'آمادهٔ دفاع', description: 'فقط دفاع نهایی باقی مانده است.', scope: 'enrollment' },
  { key: 'graduate', name: 'فارغ‌التحصیل', description: 'گواهی دوره صادر شد.', scope: 'enrollment' },
] as const satisfies readonly BadgeDef[]

export type BadgeKey = (typeof BADGES)[number]['key']
export const badgeDef = (key: string): BadgeDef | undefined => BADGES.find((b) => b.key === key)

/** Thresholds behind the starter badges `[80]`% etc. */
export const BADGE_RULES = { strongStartLessons: 3, strongStartDays: 7, rhythmWeeks: 3, steadyWeeks: 8, analystPct: 80, onTimeAssignments: 3, halfwayPct: 50 } as const

export type BadgeInput = {
  events: readonly LedgerEvent[]
  enrolledAt: Date | string
  /** Longest streak (weeks) from `weeklyRhythm`; 0 when streaks are off. */
  longestStreak: number
  progress: number
  eligibility: CertificateEligibility
  requiresDefense: boolean
  certificateIssued: boolean
}

const remaining = (e: CertificateEligibility): EligibilityReason[] => (e.eligible ? [] : e.missing)

/** Lessons + required quizzes + required assignments all done (only the defense may remain). */
export const courseFinished = (e: CertificateEligibility) => remaining(e).every((r) => r === 'defense')

/** Badge keys whose condition holds now. Awarding (once, dated) is the caller's ledger write. */
export function badgeCandidates(input: BadgeInput): BadgeKey[] {
  const ev = standingEvents(input.events)
  const lessons = ev.filter((e) => e.type === 'lesson.completed')
  const start = tehranDayNumber(input.enrolledAt)
  const out: BadgeKey[] = []
  if (lessons.length > 0) out.push('first-step')
  if (lessons.filter((e) => tehranDayNumber(e.occurredAt) - start < BADGE_RULES.strongStartDays).length >= BADGE_RULES.strongStartLessons) out.push('strong-start')
  if (input.longestStreak >= BADGE_RULES.rhythmWeeks) out.push('weekly-rhythm')
  if (input.longestStreak >= BADGE_RULES.steadyWeeks) out.push('steady')
  if (ev.some((e) => e.type === 'quiz.passed' && e.meta?.attemptNo === 1 && typeof e.meta.scorePct === 'number' && e.meta.scorePct >= BADGE_RULES.analystPct)) out.push('analyst')
  if (ev.filter((e) => e.type === 'assignment.submitted' && e.meta?.late === false).length >= BADGE_RULES.onTimeAssignments) out.push('on-time')
  if (input.progress >= BADGE_RULES.halfwayPct) out.push('halfway')
  if (input.progress >= 100 && courseFinished(input.eligibility)) out.push('finish-line')
  const left = remaining(input.eligibility)
  if (input.requiresDefense && left.length === 1 && left[0] === 'defense') out.push('ready-for-defense')
  if (input.certificateIssued) out.push('graduate')
  return out
}

/** Earned badges from the ledger, oldest first. */
export function earnedBadges(events: readonly LedgerEvent[]): { key: BadgeKey; name: string; description: string; earnedAt: string }[] {
  const seen = new Set<string>()
  return standingEvents(events)
    .filter((e) => e.type === 'badge.earned' && e.sourceId)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .flatMap((e) => {
      const def = badgeDef(e.sourceId!)
      if (!def || seen.has(def.key)) return []
      seen.add(def.key)
      return [{ key: def.key as BadgeKey, name: def.name, description: def.description, earnedAt: new Date(e.occurredAt).toISOString() }]
    })
}

// ---------------------------------------------------------------- Certificate path ("final boss")

export type PathStepKey = 'lessons' | 'quizzes' | 'assignments' | 'defense' | 'certificate'
export type PathStep = { key: PathStepKey; label: string; done: number; total: number; complete: boolean }

export type CertificatePath = {
  steps: PathStep[]
  /** Sealed until the certificate exists. */
  sealed: boolean
  eligible: boolean
  missing: EligibilityReason[]
  /** Calm Persian line of what is left, e.g. «یک تکلیف و دفاع نهایی باقی مانده است.» */
  remainingText: string | null
}

const fa = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
const count = (n: number, noun: string) => (n === 1 ? `یک ${noun}` : `${fa(n)} ${noun}`)

/**
 * Lessons → required quizzes → required assignments → defense (only if the course requires it) → certificate.
 * Steps with nothing in them (no required quiz, no defense) are left out (G5.6).
 */
export function certificatePath(input: {
  lessonsDone: number
  lessonsTotal: number
  requirements: readonly LearningRequirement[]
  requiresDefense: boolean
  defensePassed: boolean
  eligibility: CertificateEligibility
  certificateIssued: boolean
}): CertificatePath {
  const quizzes = input.requirements.filter((r) => r.kind === 'quiz')
  const assignments = input.requirements.filter((r) => r.kind === 'assignment')
  const steps: PathStep[] = [
    { key: 'lessons', label: 'جلسه‌ها', done: Math.min(input.lessonsDone, input.lessonsTotal), total: input.lessonsTotal, complete: input.lessonsTotal > 0 && input.lessonsDone >= input.lessonsTotal },
  ]
  if (quizzes.length) steps.push({ key: 'quizzes', label: 'آزمون‌ها', done: quizzes.filter((q) => q.state === 'done').length, total: quizzes.length, complete: quizzes.every((q) => q.state === 'done') })
  if (assignments.length) {
    steps.push({ key: 'assignments', label: 'تکالیف', done: assignments.filter((a) => a.state === 'done').length, total: assignments.length, complete: assignments.every((a) => a.state === 'done') })
  }
  if (input.requiresDefense) steps.push({ key: 'defense', label: 'دفاع نهایی', done: input.defensePassed ? 1 : 0, total: 1, complete: input.defensePassed })
  steps.push({ key: 'certificate', label: 'گواهی', done: input.certificateIssued ? 1 : 0, total: 1, complete: input.certificateIssued })

  const missing = remaining(input.eligibility)
  const parts: string[] = []
  const lessonsLeft = Math.max(0, input.lessonsTotal - input.lessonsDone)
  if (missing.includes('progress') && lessonsLeft > 0) parts.push(count(lessonsLeft, 'جلسه'))
  const quizLeft = quizzes.filter((q) => q.state !== 'done').length
  if (missing.includes('quiz') && quizLeft > 0) parts.push(count(quizLeft, 'آزمون'))
  const asgLeft = assignments.filter((a) => a.state !== 'done').length
  if (missing.includes('assignment') && asgLeft > 0) parts.push(count(asgLeft, 'تکلیف'))
  if (missing.includes('defense')) parts.push('دفاع نهایی')
  const remainingText = input.certificateIssued
    ? null
    : parts.length
      ? `${parts.length > 1 ? `${parts.slice(0, -1).join('، ')} و ${parts[parts.length - 1]}` : parts[0]} باقی مانده است.`
      : input.eligibility.eligible
        ? 'همهٔ مراحل انجام شده است؛ گواهی پس از تأیید آکادمی صادر می‌شود.'
        : null
  return { steps, sealed: !input.certificateIssued, eligible: input.eligibility.eligible, missing, remainingText }
}
