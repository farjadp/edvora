/**
 * Assignments and grading (phase-2 §C1–C6). Pure rules; the web app loads records and passes them in.
 */
import { toLatinDigits } from './digits'
import type { FieldError } from './quiz'

// ---------------------------------------------------------------- Scores (C4)

export type ScoreResult = { ok: true; value: number } | { ok: false; reason: 'empty' | 'invalid' | 'range' | 'precision'; message: string }

/**
 * Parses a grade typed by staff: Persian/Arabic digits and the decimal separators `٫` `,` `،` `.` are accepted,
 * so ۱۸٫۵, 18.5 and 18,5 all give 18.5. At most `decimals` decimals, 0 ≤ score ≤ max.
 */
export function parseScore(input: string | number | null | undefined, max: number, decimals = 2): ScoreResult {
  if (input == null || (typeof input === 'string' && input.trim() === '')) return { ok: false, reason: 'empty', message: 'نمره را وارد کنید.' }
  const s = toLatinDigits(String(input)).trim().replace(/[٫,،]/g, '.').replace(/\s+/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, reason: 'invalid', message: 'نمره باید عدد باشد (مثلاً ۱۸٫۵).' }
  const frac = s.split('.')[1] ?? ''
  if (frac.replace(/0+$/, '').length > decimals) return { ok: false, reason: 'precision', message: `نمره حداکثر ${decimals} رقم اعشار دارد.` }
  const value = Number(s)
  if (!Number.isFinite(value) || value < 0 || value > max) return { ok: false, reason: 'range', message: `نمره باید بین ۰ و ${max} باشد.` }
  return { ok: true, value: Math.round(value * 10 ** decimals) / 10 ** decimals }
}

// ---------------------------------------------------------------- Authoring (C1)

export type AssignmentDraft = {
  dueAt?: string | Date | null
  maxScore?: number | null
  passScore?: number | null
  /** True when the deadline is new or changed in this save (an untouched past deadline stays valid). */
  dueAtChanged: boolean
  now: Date
}

export function validateAssignment(a: AssignmentDraft): FieldError[] {
  const errors: FieldError[] = []
  const due = a.dueAt ? new Date(a.dueAt).getTime() : NaN
  if (!Number.isFinite(due)) errors.push({ path: 'dueAt', message: 'مهلت تحویل را وارد کنید.' })
  else if (a.dueAtChanged && due <= a.now.getTime()) errors.push({ path: 'dueAt', message: 'مهلت تحویل نمی‌تواند در گذشته باشد.' })
  if (typeof a.maxScore !== 'number' || !Number.isFinite(a.maxScore) || a.maxScore <= 0) {
    errors.push({ path: 'maxScore', message: 'حداکثر نمره باید بیشتر از صفر باشد.' })
  }
  if (a.passScore != null) {
    if (!Number.isFinite(a.passScore) || a.passScore < 0) errors.push({ path: 'passScore', message: 'نمرهٔ قبولی نمی‌تواند منفی باشد.' })
    else if (typeof a.maxScore === 'number' && a.passScore > a.maxScore) errors.push({ path: 'passScore', message: 'نمرهٔ قبولی نمی‌تواند از حداکثر نمره بیشتر باشد.' })
  }
  return errors
}

// ---------------------------------------------------------------- Submitting (C2)

export type SubmissionWindow = { ok: true; late: boolean } | { ok: false; reason: 'deadline' | 'graded' }

/** Can the student submit or change their work now? */
export function submissionWindow(input: { dueAt: string | Date; allowLate?: boolean | null; graded: boolean; now: Date }): SubmissionWindow {
  if (input.graded) return { ok: false, reason: 'graded' }
  const late = input.now.getTime() > new Date(input.dueAt).getTime()
  if (late && !input.allowLate) return { ok: false, reason: 'deadline' }
  return { ok: true, late }
}

/** Upload allow-list (C2, client to confirm types and sizes). */
export const SUBMISSION_LIMITS = { maxFiles: 5, maxBytes: 20 * 1024 * 1024 } as const

export type SubmissionFileKind = 'pdf' | 'docx' | 'jpg' | 'png'

export const SUBMISSION_MIME: Record<SubmissionFileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  png: 'image/png',
}

const startsWith = (bytes: Uint8Array, sig: readonly number[]) => sig.every((b, i) => bytes[i] === b)

/**
 * File type by content (magic bytes), not by extension. DOCX is a ZIP container, so it also needs the
 * `.docx` name and a `word/` entry near the start of the archive.
 */
export function detectSubmissionFile(bytes: Uint8Array, filename: string): SubmissionFileKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf' // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && /\.docx$/i.test(filename)) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)))
    if (head.includes('[Content_Types].xml') || head.includes('word/')) return 'docx'
  }
  return null
}

// ---------------------------------------------------------------- Results (C5, C6)

export function assignmentPassed(input: { score: number | null | undefined; passScore?: number | null }): boolean {
  if (input.score == null) return false
  // Pass score empty → "graded" is enough (C6, client to confirm).
  return input.passScore == null || input.score >= input.passScore
}
