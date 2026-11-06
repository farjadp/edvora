import { describe, expect, it } from 'vitest'
import {
  allowedAttempts,
  attemptDeadline,
  attemptsLeft,
  buildReview,
  buildSnapshot,
  countedAttempt,
  gradeAttempt,
  gradeQuestion,
  isExpired,
  isPassing,
  normalizeShortAnswer,
  publicQuestions,
  reviewLevel,
  sanitizeAnswers,
  startDecision,
  validateQuestion,
  validateQuiz,
  type AttemptRecord,
  type BankQuestion,
  type SnapshotQuestion,
} from './quiz'

const single: BankQuestion = {
  id: 1,
  type: 'single',
  text: 'S?',
  points: 2,
  options: [
    { id: 'a', text: 'A', isCorrect: false },
    { id: 'b', text: 'B', isCorrect: true },
  ],
}
const multiple: BankQuestion = {
  id: 2,
  type: 'multiple',
  text: 'M?',
  points: 4,
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: true },
    { id: 'c', text: 'C', isCorrect: false },
    { id: 'd', text: 'D', isCorrect: false },
  ],
}
const tf: BankQuestion = { id: 3, type: 'trueFalse', text: 'TF?', points: 1, correctAnswer: 'false' }
const short: BankQuestion = { id: 4, type: 'short', text: 'Sh?', points: 3, acceptedAnswers: [{ answer: '12' }, { answer: 'یک‌دو' }, { answer: 'Kerman' }] }

const snap = buildSnapshot([{ question: single }, { question: multiple }, { question: tf }, { question: short }])
const q = (id: string) => snap.questions.find((x) => x.id === id) as SnapshotQuestion

describe('question validation (Q1)', () => {
  it('accepts valid questions of each type', () => {
    expect(validateQuestion({ type: 'single', text: 'x', points: 1, options: [{ text: 'a', isCorrect: true }, { text: 'b' }] })).toEqual([])
    expect(validateQuestion({ type: 'multiple', text: 'x', points: 1, options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] })).toEqual([])
    expect(validateQuestion({ type: 'trueFalse', text: 'x', points: 1, correctAnswer: 'true' })).toEqual([])
    expect(validateQuestion({ type: 'short', text: 'x', points: 1, acceptedAnswers: [{ answer: '۱۲' }] })).toEqual([])
  })
  it('rejects bad questions with Persian field errors', () => {
    expect(validateQuestion({ type: 'single', text: 'x', points: 0, options: [{ text: 'a', isCorrect: true }, { text: 'b' }] }).map((e) => e.path)).toEqual(['points'])
    expect(validateQuestion({ type: 'single', text: 'x', points: 1, options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] })[0]?.path).toBe('options')
    expect(validateQuestion({ type: 'single', text: 'x', points: 1, options: [{ text: 'a', isCorrect: true }] })[0]?.path).toBe('options')
    expect(validateQuestion({ type: 'multiple', text: 'x', points: 1, options: [{ text: 'a' }, { text: 'b' }] })[0]?.path).toBe('options')
    expect(validateQuestion({ type: 'trueFalse', text: 'x', points: 1 })[0]?.path).toBe('correctAnswer')
    expect(validateQuestion({ type: 'short', text: 'x', points: 1, acceptedAnswers: [{ answer: '  ' }] })[0]?.path).toBe('acceptedAnswers')
    expect(validateQuestion({ type: 'short', text: ' ', points: 1, acceptedAnswers: [{ answer: 'a' }] })[0]?.message).toMatch(/سؤال/)
  })
  it('validates quizzes (Q2)', () => {
    expect(validateQuiz({ questionCount: 3, passMark: 70 })).toEqual([])
    expect(validateQuiz({ questionCount: 0, passMark: 70 }).map((e) => e.path)).toEqual(['questions'])
    expect(validateQuiz({ questionCount: 1, passMark: 0 }).map((e) => e.path)).toEqual(['passMark'])
    expect(validateQuiz({ questionCount: 1, passMark: 101 }).map((e) => e.path)).toEqual(['passMark'])
    expect(validateQuiz({ questionCount: 1, passMark: 50, timeLimitMin: 0 }).map((e) => e.path)).toEqual(['timeLimitMin'])
    expect(validateQuiz({ questionCount: 1, passMark: 50, attemptsLimit: 0 }).map((e) => e.path)).toEqual(['attemptsLimit'])
  })
})

describe('snapshot', () => {
  it('stores true/false as two options and keeps per-quiz points', () => {
    const s = buildSnapshot([{ question: tf, points: 5 }])
    expect(s.questions[0]).toMatchObject({ points: 5, options: [{ id: 'true', correct: false }, { id: 'false', correct: true }] })
  })
  it('never exposes correct answers in the public payload', () => {
    const pub = JSON.stringify(publicQuestions(snap))
    expect(pub).not.toContain('correct')
    expect(pub).not.toContain('Kerman')
    expect(pub).not.toContain('acceptedAnswers')
  })
  it('shuffles questions and options deterministically with an injected rng', () => {
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const s = buildSnapshot([{ question: single }, { question: multiple }, { question: tf }, { question: short }], { shuffle: true, rng })
    expect(s.questions.map((x) => x.id).sort()).toEqual(['1', '2', '3', '4'])
    expect(s.questions.find((x) => x.id === '2')!.options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('grading (Q4)', () => {
  it('single choice and true/false: all or nothing', () => {
    expect(gradeQuestion(q('1'), { optionIds: ['b'] })).toBe(2)
    expect(gradeQuestion(q('1'), { optionIds: ['a'] })).toBe(0)
    expect(gradeQuestion(q('1'), { optionIds: ['a', 'b'] })).toBe(0)
    expect(gradeQuestion(q('3'), { optionIds: ['false'] })).toBe(1)
    expect(gradeQuestion(q('3'), { optionIds: ['true'] })).toBe(0)
    expect(gradeQuestion(q('1'), undefined)).toBe(0)
  })
  it('multiple choice: all-or-nothing by default', () => {
    expect(gradeQuestion(q('2'), { optionIds: ['a', 'b'] })).toBe(4)
    expect(gradeQuestion(q('2'), { optionIds: ['a'] })).toBe(0)
    expect(gradeQuestion(q('2'), { optionIds: ['a', 'b', 'c'] })).toBe(0)
  })
  it('multiple choice: proportional, never below zero', () => {
    const p = { partialCredit: true }
    expect(gradeQuestion(q('2'), { optionIds: ['a'] }, p)).toBe(2)
    expect(gradeQuestion(q('2'), { optionIds: ['a', 'b', 'c'] }, p)).toBe(2)
    expect(gradeQuestion(q('2'), { optionIds: ['a', 'c', 'd'] }, p)).toBe(0)
    expect(gradeQuestion(q('2'), { optionIds: ['c'] }, p)).toBe(0)
    expect(gradeQuestion(q('2'), { optionIds: ['a', 'b'] }, p)).toBe(4)
  })
  it('ignores option ids that are not in the snapshot', () => {
    expect(gradeQuestion(q('1'), { optionIds: ['zzz'] })).toBe(0)
  })
  it('short answer: Persian/Arabic digits, ي/ك, tatweel, diacritics, ZWNJ, spaces, case', () => {
    expect(gradeQuestion(q('4'), { text: '۱۲' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: '١٢' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: ' 12 ' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: 'یک دو' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: 'يك‌دو' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: 'KERMAN' })).toBe(3)
    expect(gradeQuestion(q('4'), { text: 'Kermann' })).toBe(0) // no fuzzy matching
    expect(gradeQuestion(q('4'), { text: '' })).toBe(0)
    expect(normalizeShortAnswer('كتابـــ  خانهٔ‌من')).toBe('کتاب خانه من')
    expect(normalizeShortAnswer('مَدرِسه')).toBe('مدرسه')
  })
  it('totals and pass mark', () => {
    const g = gradeAttempt(snap, { '1': { optionIds: ['b'] }, '2': { optionIds: ['a', 'b'] }, '3': { optionIds: ['true'] }, '4': { text: '۱۲' } }, { passMark: 90 })
    expect(g).toMatchObject({ score: 9, maxScore: 10, passed: true })
    expect(g.questions.find((x) => x.id === '3')).toMatchObject({ earned: 0, correct: false, answered: true })
    expect(gradeAttempt(snap, {}, { passMark: 1 })).toMatchObject({ score: 0, passed: false })
    expect(isPassing(7, 10, 70)).toBe(true)
    expect(isPassing(6.99, 10, 70)).toBe(false)
    expect(isPassing(5.6, 8, 70)).toBe(true)
    expect(isPassing(0, 0, 50)).toBe(false)
  })
})

describe('attempts (Q5, Q6)', () => {
  const at = (n: number, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
    attemptNo: n,
    status: 'submitted',
    score: 0,
    passed: false,
    startedAt: `2026-11-0${n}T10:00:00Z`,
    submittedAt: `2026-11-0${n}T10:10:00Z`,
    ...extra,
  })

  it('counts the best attempt by default, the last on request', () => {
    const list = [at(1, { score: 8, passed: true }), at(2, { score: 3 }), at(3, { score: 8, passed: true })]
    expect(countedAttempt(list, 'best')?.attemptNo).toBe(1)
    expect(countedAttempt(list, 'last')?.attemptNo).toBe(3)
    expect(countedAttempt([at(1, { score: 9, passed: true }), at(2, { score: 1 })], 'last')?.passed).toBe(false)
    expect(countedAttempt([at(1, { status: 'in_progress' })], 'best')).toBeNull()
  })
  it('limits attempts, including extra attempts granted by staff', () => {
    expect(allowedAttempts(null)).toBeNull()
    expect(allowedAttempts(3, 2)).toBe(5)
    expect(attemptsLeft(3, 3)).toBe(0)
    expect(attemptsLeft(3, 3, 1)).toBe(1)
    expect(attemptsLeft(9, null)).toBeNull()
    const three = [at(1), at(2), at(3)]
    expect(startDecision({ attempts: three, attemptsLimit: 3, countedMode: 'best' })).toEqual({ ok: false, reason: 'no_attempts' })
    expect(startDecision({ attempts: three, attemptsLimit: 3, extraAttempts: 1, countedMode: 'best' })).toEqual({ ok: true, resume: false, attemptNo: 4 })
    expect(startDecision({ attempts: [], attemptsLimit: 3, countedMode: 'best' })).toEqual({ ok: true, resume: false, attemptNo: 1 })
  })
  it('resumes the in-progress attempt instead of opening another', () => {
    expect(startDecision({ attempts: [at(1), at(2, { status: 'in_progress' })], attemptsLimit: 2, countedMode: 'best' })).toEqual({ ok: true, resume: true, attemptNo: 2 })
  })
  it('blocks a retake after passing unless allowed', () => {
    const passed = [at(1, { score: 9, passed: true })]
    expect(startDecision({ attempts: passed, countedMode: 'best' })).toEqual({ ok: false, reason: 'passed' })
    expect(startDecision({ attempts: passed, countedMode: 'best', allowRetakeAfterPass: true })).toMatchObject({ ok: true, attemptNo: 2 })
  })
  it('the server clock decides time-outs, with a grace period', () => {
    const start = new Date('2026-11-06T10:00:00Z')
    const deadline = attemptDeadline(start, 20)!
    expect(deadline.toISOString()).toBe('2026-11-06T10:20:00.000Z')
    expect(attemptDeadline(start, null)).toBeNull()
    expect(isExpired(deadline, new Date('2026-11-06T10:20:05Z'))).toBe(false)
    expect(isExpired(deadline, new Date('2026-11-06T10:20:11Z'))).toBe(true)
    expect(isExpired(null, new Date('2030-01-01T00:00:00Z'))).toBe(false)
  })
  it('sanitises saved answers against the snapshot', () => {
    expect(sanitizeAnswers(snap, { '1': { optionIds: ['a', 'b'] }, '2': { optionIds: ['a', 'zz', 'a'] }, '4': { text: 12 }, '99': { text: 'x' } })).toEqual({
      '1': { optionIds: ['a'] },
      '2': { optionIds: ['a'] },
    })
    expect(sanitizeAnswers(snap, 'nope')).toEqual({})
  })
})

describe('review (Q7)', () => {
  const answers = { '1': { optionIds: ['a'] }, '4': { text: '12' } }
  const grade = gradeAttempt(snap, answers, { passMark: 50 })

  it('degrades "full" until its condition holds', () => {
    expect(reviewLevel({ review: 'full', fullWhen: 'always', passed: false, attemptsLeft: 2 })).toBe('full')
    expect(reviewLevel({ review: 'full', fullWhen: 'afterPass', passed: false, attemptsLeft: 2 })).toBe('wrongRight')
    expect(reviewLevel({ review: 'full', fullWhen: 'afterPass', passed: true, attemptsLeft: 2 })).toBe('full')
    expect(reviewLevel({ review: 'full', fullWhen: 'afterLastAttempt', passed: false, attemptsLeft: 1 })).toBe('wrongRight')
    expect(reviewLevel({ review: 'full', fullWhen: 'afterLastAttempt', passed: false, attemptsLeft: 0 })).toBe('full')
    expect(reviewLevel({ review: 'score', passed: true, attemptsLeft: 0 })).toBe('score')
  })
  it('leaves correct answers out of the payload below "full"', () => {
    for (const level of ['none', 'score', 'wrongRight'] as const) {
      const json = JSON.stringify(buildReview(snap, answers, grade, level))
      expect(json).not.toContain('correctOptionIds')
      expect(json).not.toContain('Kerman')
    }
    expect(buildReview(snap, answers, grade, 'none')).toEqual({ level: 'none', passed: false, questions: [] })
    expect(buildReview(snap, answers, grade, 'score')).toMatchObject({ score: 3, maxScore: 10, questions: [] })
    const wr = buildReview(snap, answers, grade, 'wrongRight')
    expect(wr.questions.find((x) => x.id === '1')).toMatchObject({ correct: false, myOptionIds: ['a'] })
    const full = buildReview(snap, answers, grade, 'full')
    expect(full.questions.find((x) => x.id === '2')?.correctOptionIds).toEqual(['a', 'b'])
    expect(full.questions.find((x) => x.id === '4')?.acceptedAnswers).toContain('Kerman')
  })
})
