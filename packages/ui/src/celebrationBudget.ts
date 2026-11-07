/**
 * Celebration budget (E-027 §3): at most 1 per page view and 3 per day per person. Pure so it is unit-tested; the
 * component reads/writes localStorage around it (always in try/catch: private mode, blocked storage).
 */
export const MAX_PER_VIEW = 1
export const MAX_PER_DAY = 3

export type CelebrationLedger = { day: string; ids: string[] }

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Parses the stored ledger; anything malformed or from another day is an empty ledger. */
export function parseLedger(raw: string | null, day: string): CelebrationLedger {
  if (!raw) return { day, ids: [] }
  try {
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && (v as CelebrationLedger).day === day && Array.isArray((v as CelebrationLedger).ids)) {
      return { day, ids: (v as CelebrationLedger).ids.filter((x): x is string => typeof x === 'string').slice(0, 50) }
    }
  } catch {
    /* fall through */
  }
  return { day, ids: [] }
}

/** Is a full celebration allowed for `id` now? An id that already celebrated today is not counted twice. */
export function allowCelebration(ledger: CelebrationLedger, id: string, shownThisView: number): boolean {
  if (ledger.ids.includes(id)) return shownThisView <= MAX_PER_VIEW
  return ledger.ids.length < MAX_PER_DAY && shownThisView < MAX_PER_VIEW
}

export function recordCelebration(ledger: CelebrationLedger, id: string): CelebrationLedger {
  return ledger.ids.includes(id) ? ledger : { ...ledger, ids: [...ledger.ids, id] }
}
