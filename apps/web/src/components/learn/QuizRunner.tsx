'use client'

import { toPersianDigits } from '@edvora/core/digits'
import type { Answers } from '@edvora/core/quiz'
import { buttonClass, inputClass } from '@edvora/ui/classes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveQuizAnswers, submitQuiz } from '../../app/(frontend)/actions'
import type { AttemptPlay } from '../../lib/quizAttempts'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline'

const storageKey = (attemptId: number) => `edvora-quiz-${attemptId}`

function readLocal(attemptId: number): Answers {
  try {
    const raw = window.localStorage.getItem(storageKey(attemptId))
    return raw ? (JSON.parse(raw) as Answers) : {}
  } catch {
    return {}
  }
}

function writeLocal(attemptId: number, answers: Answers) {
  try {
    window.localStorage.setItem(storageKey(attemptId), JSON.stringify(answers))
  } catch {
    // Private mode / quota: the server copy still exists.
  }
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return toPersianDigits(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
}

/**
 * Taking a quiz (Q3). Answers autosave to the server and to this device; a dropped connection keeps retrying.
 * The timer is advisory: the server decides when time is up (Q5).
 */
export function QuizRunner({ play }: { play: AttemptPlay }) {
  const [answers, setAnswers] = useState<Answers>(play.answers)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const dirty = useRef(false)
  const latest = useRef(answers)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitted = useRef(false)

  // Unsaved answers from a previous visit on this device win over the server copy.
  useEffect(() => {
    const local = readLocal(play.attemptId)
    if (Object.keys(local).length) {
      const merged = { ...play.answers, ...local }
      latest.current = merged
      setAnswers(merged)
      dirty.current = true
    }
  }, [play.attemptId, play.answers])

  const go = (url: string) => {
    try {
      window.localStorage.removeItem(storageKey(play.attemptId))
    } catch {
      // ignore
    }
    window.location.assign(url)
  }

  const flush = useCallback(async () => {
    if (!dirty.current || submitted.current) return
    dirty.current = false
    setStatus('saving')
    const res = await saveQuizAnswers({ attemptId: play.attemptId, answers: latest.current }).catch(() => null)
    if (res?.ok) {
      setStatus('saved')
      return
    }
    if (res?.closed) {
      if (res.redirectTo) go(res.redirectTo)
      else setError(res.message)
      return
    }
    dirty.current = true
    setStatus('offline')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 4000)
  }, [play.attemptId])

  const update = (questionId: string, answer: Answers[string]) => {
    const next = { ...latest.current, [questionId]: answer }
    latest.current = next
    setAnswers(next)
    writeLocal(play.attemptId, next)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }

  const submit = useCallback(async () => {
    if (submitted.current) return
    submitted.current = true
    setSubmitting(true)
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    const res = await submitQuiz({ attemptId: play.attemptId, answers: latest.current }).catch(() => null)
    if (res?.redirectTo) return go(res.redirectTo)
    submitted.current = false
    setSubmitting(false)
    setError(res?.message ?? 'ارسال انجام نشد. پاسخ‌ها روی همین دستگاه نگه داشته شده‌اند؛ دوباره تلاش کنید.')
  }, [play.attemptId])

  // Advisory countdown, corrected for the difference between this device's clock and the server's.
  useEffect(() => {
    if (!play.deadlineAt) return
    const skew = new Date(play.serverNow).getTime() - Date.now()
    const deadline = new Date(play.deadlineAt).getTime()
    const tick = () => {
      const left = deadline - (Date.now() + skew)
      setRemaining(left)
      if (left <= 0) void submit()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [play.deadlineAt, play.serverNow, submit])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const answered = play.questions.filter((q) => {
    const a = answers[q.id]
    return (a?.optionIds?.length ?? 0) > 0 || (a?.text ?? '').trim() !== ''
  }).length

  return (
    <div className="grid gap-6">
      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
        <span>
          {toPersianDigits(answered)} از {toPersianDigits(play.questions.length)} پاسخ داده شده
        </span>
        <span aria-live="polite" className={status === 'offline' ? 'text-danger' : 'text-muted'}>
          {status === 'saving' ? 'در حال ذخیره…' : status === 'saved' ? 'ذخیره شد' : status === 'offline' ? 'روی این دستگاه ذخیره شد، دوباره تلاش می‌کنیم…' : ''}
        </span>
        {remaining !== null ? (
          <span role="timer" aria-label="زمان باقی‌مانده" className={remaining < 60_000 ? 'font-latin font-bold text-danger' : 'font-latin font-bold'}>
            {remaining > 0 ? clock(remaining) : 'زمان تمام شد'}
          </span>
        ) : null}
      </div>

      <ol className="grid gap-4">
        {play.questions.map((q, i) => {
          const a = answers[q.id]
          return (
            <li key={q.id}>
              <fieldset className="rounded-2xl border border-line bg-surface p-5">
                <legend className="sr-only">سؤال {toPersianDigits(i + 1)}</legend>
                <p className="text-xs text-muted">
                  سؤال {toPersianDigits(i + 1)} از {toPersianDigits(play.questions.length)} · {toPersianDigits(q.points)} امتیاز
                  {q.type === 'multiple' ? ' · چند گزینه ممکن است درست باشد' : ''}
                </p>
                <p className="mt-2 whitespace-pre-line font-bold leading-8">{q.text}</p>
                {q.type === 'short' ? (
                  <label className="mt-3 grid gap-2 text-sm">
                    <span className="text-muted">پاسخ شما</span>
                    <input
                      dir="auto"
                      value={a?.text ?? ''}
                      onChange={(e) => update(q.id, { text: e.target.value })}
                      maxLength={500}
                      className={inputClass({ tone: 'bg', block: true })}
                    />
                  </label>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {q.options.map((o) => {
                      const checked = a?.optionIds?.includes(o.id) ?? false
                      return (
                        <label
                          key={o.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 has-checked:border-brand has-checked:bg-sunken has-focus-visible:outline-2 has-focus-visible:outline-focus"
                        >
                          <input
                            type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                            name={`q-${q.id}`}
                            value={o.id}
                            checked={checked}
                            onChange={(e) => {
                              const current = a?.optionIds ?? []
                              const next = q.type === 'multiple' ? (e.target.checked ? [...current, o.id] : current.filter((x) => x !== o.id)) : [o.id]
                              update(q.id, { optionIds: next })
                            }}
                            className="size-4 accent-brand"
                          />
                          <span className="leading-7">{o.text}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </fieldset>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-3">
        <button type="button" disabled={submitting} onClick={() => void submit()} className={buttonClass({ block: true })}>
          {submitting ? 'در حال ارسال…' : 'ارسال پاسخ‌ها'}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
