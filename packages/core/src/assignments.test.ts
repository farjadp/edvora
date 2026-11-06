import { describe, expect, it } from 'vitest'
import { assignmentPassed, detectSubmissionFile, parseScore, submissionWindow, validateAssignment } from './assignments'
import {
  assignmentRequirementState,
  certificateEligibility,
  lessonCompletionBlockers,
  quizRequirementState,
  type Requirement,
} from './progress'

describe('parseScore (C4)', () => {
  it('normalises digits and decimal separators', () => {
    for (const input of ['۱۸٫۵', '18.5', '18,5', '١٨٫٥', ' 18.50 ', '۱۸،۵']) expect(parseScore(input, 20)).toEqual({ ok: true, value: 18.5 })
    expect(parseScore(20, 20)).toEqual({ ok: true, value: 20 })
    expect(parseScore('0', 20)).toEqual({ ok: true, value: 0 })
  })
  it('rejects out-of-range, text, too many decimals and empty input', () => {
    expect(parseScore('21', 20)).toMatchObject({ ok: false, reason: 'range' })
    expect(parseScore('-1', 20)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(parseScore('abc', 20)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(parseScore('18.555', 20)).toMatchObject({ ok: false, reason: 'precision' })
    expect(parseScore('', 20)).toMatchObject({ ok: false, reason: 'empty' })
    expect(parseScore(null, 20)).toMatchObject({ ok: false, reason: 'empty' })
  })
})

describe('validateAssignment (C1)', () => {
  const now = new Date('2026-11-06T10:00:00Z')
  it('accepts a valid assignment', () => {
    expect(validateAssignment({ dueAt: '2026-12-01T10:00:00Z', maxScore: 20, passScore: 12, dueAtChanged: true, now })).toEqual([])
    expect(validateAssignment({ dueAt: '2026-10-01T10:00:00Z', maxScore: 20, dueAtChanged: false, now })).toEqual([])
  })
  it('rejects a past deadline, max ≤ 0, pass > max', () => {
    expect(validateAssignment({ dueAt: '2026-10-01T10:00:00Z', maxScore: 20, dueAtChanged: true, now }).map((e) => e.path)).toEqual(['dueAt'])
    expect(validateAssignment({ dueAt: '2026-12-01T10:00:00Z', maxScore: 0, dueAtChanged: true, now }).map((e) => e.path)).toEqual(['maxScore'])
    expect(validateAssignment({ dueAt: '2026-12-01T10:00:00Z', maxScore: 20, passScore: 21, dueAtChanged: true, now }).map((e) => e.path)).toEqual(['passScore'])
  })
})

describe('submissionWindow (C2)', () => {
  const dueAt = '2026-11-10T20:30:00Z'
  it('allows before the deadline, blocks after unless late is allowed', () => {
    expect(submissionWindow({ dueAt, graded: false, now: new Date('2026-11-10T20:00:00Z') })).toEqual({ ok: true, late: false })
    expect(submissionWindow({ dueAt, graded: false, now: new Date('2026-11-10T21:00:00Z') })).toEqual({ ok: false, reason: 'deadline' })
    expect(submissionWindow({ dueAt, allowLate: true, graded: false, now: new Date('2026-11-10T21:00:00Z') })).toEqual({ ok: true, late: true })
    expect(submissionWindow({ dueAt, graded: true, now: new Date('2026-11-01T00:00:00Z') })).toEqual({ ok: false, reason: 'graded' })
  })
})

describe('detectSubmissionFile (C2f)', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  it('checks content, not the extension', () => {
    expect(detectSubmissionFile(new TextEncoder().encode('%PDF-1.4 ...'), 'a.pdf')).toBe('pdf')
    expect(detectSubmissionFile(new TextEncoder().encode('%PDF-1.4 ...'), 'renamed.png')).toBe('pdf')
    expect(detectSubmissionFile(bytes(0xff, 0xd8, 0xff, 0xe0), 'a.jpg')).toBe('jpg')
    expect(detectSubmissionFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'a.png')).toBe('png')
    expect(detectSubmissionFile(new TextEncoder().encode('MZ executable'), 'evil.pdf')).toBeNull()
    expect(detectSubmissionFile(new TextEncoder().encode('<html>'), 'page.pdf')).toBeNull()
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....[Content_Types].xml....word/document.xml')])
    expect(detectSubmissionFile(zip, 'report.docx')).toBe('docx')
    expect(detectSubmissionFile(zip, 'report.zip')).toBeNull()
  })
})

describe('requirements and certificate gates (C6, Q8, R8)', () => {
  const quiz = (state: Requirement['state'], lessonId: string | null = null): Requirement => ({ kind: 'quiz', id: 'q1', title: 'Q', state, lessonId })
  const asg = (state: Requirement['state']): Requirement => ({ kind: 'assignment', id: 'a1', title: 'A', state })

  it('assignment pass logic', () => {
    expect(assignmentPassed({ score: 12, passScore: 12 })).toBe(true)
    expect(assignmentPassed({ score: 11.5, passScore: 12 })).toBe(false)
    expect(assignmentPassed({ score: 0, passScore: null })).toBe(true)
    expect(assignmentPassed({ score: null, passScore: null })).toBe(false)
    expect(assignmentRequirementState({ released: true, score: null, passScore: 12 })).toBe('pending')
    expect(assignmentRequirementState({ released: true, score: 10, passScore: 12 })).toBe('failed')
    expect(assignmentRequirementState({ released: true, score: 18.5, passScore: 12 })).toBe('done')
    expect(assignmentRequirementState({ released: false, score: 18.5, passScore: 12 })).toBe('unreleased')
  })
  it('quiz requirement states', () => {
    expect(quizRequirementState({ released: true, passed: true, attemptsLeft: 0, hasInProgress: false })).toBe('done')
    expect(quizRequirementState({ released: true, passed: false, attemptsLeft: 0, hasInProgress: false })).toBe('failed')
    expect(quizRequirementState({ released: true, passed: false, attemptsLeft: null, hasInProgress: false })).toBe('pending')
    expect(quizRequirementState({ released: false, passed: false, attemptsLeft: 3, hasInProgress: false })).toBe('unreleased')
  })
  it('blocks the certificate with reasons quiz and assignment', () => {
    expect(certificateEligibility({ progress: 100, defensePassed: true, requiresDefense: true, requirements: [quiz('pending'), asg('done')] })).toEqual({
      eligible: false,
      reason: 'quiz',
      missing: ['quiz'],
    })
    expect(certificateEligibility({ progress: 100, defensePassed: false, requiresDefense: true, requirements: [quiz('done'), asg('failed')] })).toEqual({
      eligible: false,
      reason: 'assignment',
      missing: ['assignment', 'defense'],
    })
    expect(certificateEligibility({ progress: 80, defensePassed: false, requiresDefense: false, requirements: [quiz('unreleased')] })).toMatchObject({
      reason: 'progress',
      missing: ['progress', 'quiz'],
    })
    expect(certificateEligibility({ progress: 100, defensePassed: false, requiresDefense: false, requirements: [quiz('done'), asg('done')] })).toEqual({ eligible: true })
  })
  it('a required lesson quiz blocks only its own lesson', () => {
    const reqs = [quiz('pending', '2'), asg('pending')]
    expect(lessonCompletionBlockers(reqs, '2')).toHaveLength(1)
    expect(lessonCompletionBlockers(reqs, '3')).toHaveLength(0)
    expect(lessonCompletionBlockers([quiz('done', '2')], '2')).toHaveLength(0)
  })
})
