/**
 * Cohort leaderboard (PRD §3.5, G7). Off by default per tenant, then opt-in per student (default off). Same cohort
 * only. Shows top N + the viewer's own rank; never bottom ranks, never real names or ids. Hidden until enough
 * students opted in. No UI yet (G7 waits for the PRD open questions).
 */

export type LeaderboardEntry = {
  /** Used only to find the viewer; never returned. */
  userId: number | string
  optedIn: boolean
  /** Nickname or initials («ع. ر.»); the real name is never passed here. */
  label: string
  weekXp: number
  totalXp: number
}

export type LeaderboardRow = { rank: number; label: string; xp: number; isViewer: boolean }

export type Leaderboard =
  | { visible: false; reason: 'disabled' | 'not_opted_in' | 'not_enough'; optedIn: number; minimum: number }
  | { visible: true; metric: 'week' | 'total'; top: LeaderboardRow[]; viewer: { rank: number; of: number } }

/** Initials from a full name: «علی رضایی» → «ع. ر.». */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return parts
    .slice(0, 2)
    .map((p) => `${[...p][0]}.`)
    .join(' ')
}

/** Standard competition ranking: ties share the rank (1, 1, 3). */
export function rankBy<T>(items: readonly T[], score: (t: T) => number): { item: T; rank: number }[] {
  const sorted = [...items].sort((a, b) => score(b) - score(a))
  let rank = 0
  let prev: number | null = null
  return sorted.map((item, i) => {
    const s = score(item)
    if (prev === null || s !== prev) rank = i + 1
    prev = s
    return { item, rank }
  })
}

export function cohortLeaderboard(input: {
  enabled: boolean
  entries: readonly LeaderboardEntry[]
  viewerId: number | string
  size: number
  minimum: number
  metric?: 'week' | 'total'
}): Leaderboard {
  const metric = input.metric ?? 'week'
  const opted = input.entries.filter((e) => e.optedIn)
  const base = { optedIn: opted.length, minimum: input.minimum }
  if (!input.enabled) return { visible: false, reason: 'disabled', ...base }
  const viewer = opted.find((e) => String(e.userId) === String(input.viewerId))
  if (!viewer) return { visible: false, reason: 'not_opted_in', ...base }
  if (opted.length < input.minimum) return { visible: false, reason: 'not_enough', ...base }

  const score = (e: LeaderboardEntry) => (metric === 'week' ? e.weekXp : e.totalXp)
  const ranked = rankBy(opted, score)
  const size = Math.max(1, Math.floor(input.size))
  // Top N; a tie on the N-th rank lists everyone sharing it (G7.5).
  const cutoff = ranked[size - 1]?.rank ?? Number.POSITIVE_INFINITY
  const top = ranked
    .filter((r) => r.rank <= cutoff)
    .map((r) => ({ rank: r.rank, label: r.item.label, xp: score(r.item), isViewer: String(r.item.userId) === String(input.viewerId) }))
  const me = ranked.find((r) => String(r.item.userId) === String(input.viewerId))!
  return { visible: true, metric, top, viewer: { rank: me.rank, of: opted.length } }
}
