/**
 * Tenant gamification settings (E-028 T1, PRD §2). Stored on `tenants.gamification`; read ONLY through
 * `normalizeGamification` so a missing / partial / legacy value always resolves to the PRD defaults.
 * Defaults marked `[ ]` in the PRD are tenant config here, never hard-coded rules.
 */
import { z } from 'zod'

export const WEEK_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
export type WeekDay = (typeof WEEK_DAYS)[number]

/** JS `getUTCDay()` numbering (0 = Sunday … 6 = Saturday). */
export const WEEK_DAY_INDEX: Record<WeekDay, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

export const GAMIFICATION_AUDIENCES = ['both', 'students', 'staff'] as const
export type GamificationAudience = (typeof GAMIFICATION_AUDIENCES)[number]

export const GAMIFICATION_MECHANICS = ['xp', 'streak', 'badges', 'leaderboard', 'celebrations', 'staffGoals', 'financeInbox'] as const
export type GamificationMechanic = (typeof GAMIFICATION_MECHANICS)[number]

export type GamificationBreak = { label?: string | null; startsAt: string; endsAt: string }

export type GamificationSettings = {
  /** Master switch. On for new academies (Farjad, 2026-11-06). */
  enabled: boolean
  audience: GamificationAudience
  mechanics: Record<GamificationMechanic, boolean>
  /** Learning days per week for a "streak week" (PRD: 2, range 1–5). */
  weeklyGoalDays: number
  /** First day of the (Jalali) week. PRD `[Saturday? confirm]`. */
  weekStart: WeekDay
  /** One freeze earned per N streak weeks… */
  freezeEveryWeeks: number
  /** …banked up to this many. */
  freezeMax: number
  /** Activity XP per Tehran day (milestones are exempt). */
  dailyXpCap: number
  /** Watched share of a video that counts as a server-confirmed completion (Phase 2 B3, `[90]`). */
  completionThresholdPct: number
  /** Leaderboard top N (3–10) and the opted-in minimum before it shows (`[8]`). */
  leaderboardSize: number
  leaderboardMinimum: number
  /** Staff non-working days (neutral for the follow-up streak). PRD `[Iran weekend: Thu/Fri? confirm]`. */
  weekendDays: WeekDay[]
  /** Team weekly follow-up goal; null = "every follow-up due this week". */
  teamWeeklyGoal: number | null
  /** Academy-wide breaks (e.g. Nowruz): neutral for student weeks and staff days. */
  breaks: GamificationBreak[]
}

export const GAMIFICATION_DEFAULTS: GamificationSettings = {
  enabled: true,
  audience: 'both',
  mechanics: { xp: true, streak: true, badges: true, leaderboard: false, celebrations: true, staffGoals: true, financeInbox: true },
  weeklyGoalDays: 2,
  weekStart: 'saturday',
  freezeEveryWeeks: 4,
  freezeMax: 2,
  dailyXpCap: 150,
  completionThresholdPct: 90,
  leaderboardSize: 5,
  leaderboardMinimum: 8,
  weekendDays: ['thursday', 'friday'],
  teamWeeklyGoal: null,
  breaks: [],
}

const D = GAMIFICATION_DEFAULTS
const bool = (d: boolean) => z.boolean().nullish().transform((v) => v ?? d).catch(d)
const int = (d: number, min: number, max: number) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? d)
    .catch(d)
const isoDate = z.union([z.string(), z.date()]).transform((v, ctx) => {
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'invalid date' })
    return z.NEVER
  }
  return d.toISOString()
})

const BreakSchema = z.object({ label: z.string().max(120).nullish(), startsAt: isoDate, endsAt: isoDate })

const Schema = z.object({
  enabled: bool(D.enabled),
  audience: z.enum(GAMIFICATION_AUDIENCES).nullish().transform((v) => v ?? D.audience).catch(D.audience),
  xp: bool(D.mechanics.xp),
  streak: bool(D.mechanics.streak),
  badges: bool(D.mechanics.badges),
  leaderboard: bool(D.mechanics.leaderboard),
  celebrations: bool(D.mechanics.celebrations),
  staffGoals: bool(D.mechanics.staffGoals),
  financeInbox: bool(D.mechanics.financeInbox),
  weeklyGoalDays: int(D.weeklyGoalDays, 1, 5),
  weekStart: z.enum(WEEK_DAYS).nullish().transform((v) => v ?? D.weekStart).catch(D.weekStart),
  freezeEveryWeeks: int(D.freezeEveryWeeks, 1, 52),
  freezeMax: int(D.freezeMax, 0, 10),
  dailyXpCap: int(D.dailyXpCap, 10, 10_000),
  completionThresholdPct: int(D.completionThresholdPct, 50, 100),
  leaderboardSize: int(D.leaderboardSize, 3, 10),
  leaderboardMinimum: int(D.leaderboardMinimum, 2, 100),
  weekendDays: z
    .array(z.enum(WEEK_DAYS))
    .nullish()
    .transform((v) => (v ? [...new Set(v)] : [...D.weekendDays]))
    .catch([...D.weekendDays]),
  teamWeeklyGoal: z.coerce.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null).catch(null),
  breaks: z
    .array(z.unknown())
    .nullish()
    .transform((v) =>
      (v ?? []).flatMap((x): GamificationBreak[] => {
        const r = BreakSchema.safeParse(x)
        return r.success && r.data.endsAt >= r.data.startsAt ? [{ label: r.data.label ?? null, startsAt: r.data.startsAt, endsAt: r.data.endsAt }] : []
      }),
    )
    .catch([]),
})

/** Any stored value (null, partial group, old shape) → complete settings. Never throws. */
export function normalizeGamification(raw: unknown): GamificationSettings {
  const p = Schema.parse(raw && typeof raw === 'object' ? raw : {})
  return {
    enabled: p.enabled,
    audience: p.audience,
    mechanics: { xp: p.xp, streak: p.streak, badges: p.badges, leaderboard: p.leaderboard, celebrations: p.celebrations, staffGoals: p.staffGoals, financeInbox: p.financeInbox },
    weeklyGoalDays: p.weeklyGoalDays,
    weekStart: p.weekStart,
    freezeEveryWeeks: p.freezeEveryWeeks,
    freezeMax: p.freezeMax,
    dailyXpCap: p.dailyXpCap,
    completionThresholdPct: p.completionThresholdPct,
    leaderboardSize: p.leaderboardSize,
    leaderboardMinimum: p.leaderboardMinimum,
    weekendDays: p.weekendDays,
    teamWeeklyGoal: p.teamWeeklyGoal,
    breaks: p.breaks,
  }
}

/** Effective switches: master AND audience AND mechanic. UI and server read these, never the raw toggles. */
export type GamificationFlags = {
  settings: GamificationSettings
  /** Any student-facing gamification at all. Off → progress %, "continue" and certificate only (PRD §2). */
  students: boolean
  staff: boolean
  xp: boolean
  levels: boolean
  streak: boolean
  badges: boolean
  leaderboard: boolean
  celebrations: boolean
  staffGoals: boolean
  financeInbox: boolean
}

export function gamificationFlags(raw: unknown): GamificationFlags {
  const s = normalizeGamification(raw)
  const students = s.enabled && s.audience !== 'staff'
  const staff = s.enabled && s.audience !== 'students'
  const m = s.mechanics
  return {
    settings: s,
    students,
    staff,
    xp: students && m.xp,
    levels: students && m.xp,
    streak: students && m.streak,
    badges: students && m.badges,
    // The leaderboard ranks XP, so it needs XP on too.
    leaderboard: students && m.xp && m.leaderboard,
    celebrations: students && m.celebrations,
    staffGoals: staff && m.staffGoals,
    financeInbox: staff && m.financeInbox,
  }
}
