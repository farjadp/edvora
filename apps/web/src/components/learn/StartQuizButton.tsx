'use client'

import { buttonClass } from '@edvora/ui/classes'
import { useActionState } from 'react'
import { startQuiz, type FormState } from '../../app/(frontend)/actions'
import { useRedirectTo } from '../useRedirectTo'

/** Start (or resume) an attempt. The server creates it with its own clock (Q3). */
export function StartQuizButton({ quizId, courseSlug, label }: { quizId: number; courseSlug: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startQuiz, null)
  useRedirectTo(state)
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="course" value={courseSlug} />
      <button disabled={pending || Boolean(state?.redirectTo)} className={buttonClass({ block: true })}>
        {pending || state?.redirectTo ? 'در حال آماده‌سازی…' : label}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
