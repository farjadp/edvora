/**
 * Lead pipeline for advisors. The academy sells by phone ("an advisor will call you"),
 * so every lead moves through these stages.
 */
export const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'enrolled', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS_FA: Record<LeadStatus, string> = {
  new: 'جدید',
  contacted: 'تماس گرفته شد',
  follow_up: 'پیگیری',
  enrolled: 'ثبت‌نام کرد',
  lost: 'از دست رفت',
}

const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['contacted', 'lost'],
  contacted: ['follow_up', 'enrolled', 'lost'],
  follow_up: ['contacted', 'enrolled', 'lost'],
  enrolled: [],
  lost: ['follow_up'],
}

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to)
}

/** Default follow-up delay per stage, in hours. */
const FOLLOW_UP_HOURS: Partial<Record<LeadStatus, number>> = {
  new: 2,
  contacted: 48,
  follow_up: 72,
  lost: 24 * 30,
}

export function nextFollowUpAt(status: LeadStatus, from: Date = new Date()): Date | null {
  const h = FOLLOW_UP_HOURS[status]
  return h === undefined ? null : new Date(from.getTime() + h * 60 * 60 * 1000)
}
