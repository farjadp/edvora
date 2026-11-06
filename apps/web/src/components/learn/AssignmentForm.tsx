'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { buttonClass } from '@edvora/ui/classes'
import { useActionState, useState } from 'react'
import { submitAssignment, type FormState } from '../../app/(frontend)/actions'
import { useRedirectTo } from '../useRedirectTo'

type ExistingFile = { id: number; label: string; href: string }

/**
 * Submit or replace work before the deadline (C2). The typed text is kept in state, so a failed upload never
 * loses it (C2f). Files are checked again on the server by content, size and count.
 */
export function AssignmentForm(props: { assignmentId: number; courseSlug: string; initialText: string; files: ExistingFile[]; maxFiles: number; maxMb: number; resubmit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitAssignment, null)
  const [text, setText] = useState(props.initialText)
  useRedirectTo(state)

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="assignmentId" value={props.assignmentId} />
      <input type="hidden" name="course" value={props.courseSlug} />
      <label className="grid gap-2 text-sm font-bold">
        متن پاسخ
        <textarea
          name="text"
          dir="auto"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={20000}
          className="rounded-xl border border-line-strong bg-bg p-4 font-normal leading-8 outline-none focus:border-focus focus:ring-1 focus:ring-focus"
        />
      </label>

      {props.files.length ? (
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-1 font-bold">فایل‌های فرستاده‌شده</legend>
          {props.files.map((f) => (
            <label key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2">
              <a href={f.href} className="text-brand hover:underline">
                {f.label}
              </a>
              <span className="flex items-center gap-2 text-muted">
                <input type="checkbox" name="removeFile" value={f.id} className="size-4 accent-brand" />
                حذف
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="grid gap-2 text-sm font-bold">
        افزودن فایل
        <input
          type="file"
          name="files"
          multiple
          accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="rounded-xl border border-dashed border-line-strong bg-bg p-4 text-sm font-normal file:me-3 file:rounded-lg file:border-0 file:bg-sunken file:px-3 file:py-2 file:text-ink"
        />
        <span className="font-normal text-muted">
          PDF، DOCX، JPG یا PNG — هر فایل حداکثر {toPersianDigits(props.maxMb)} مگابایت، روی هم حداکثر {toPersianDigits(props.maxFiles)} فایل.
        </span>
      </label>

      <button disabled={pending || Boolean(state?.redirectTo)} className={buttonClass({ block: true })}>
        {pending ? 'در حال ارسال…' : props.resubmit ? 'به‌روزرسانی تحویل' : 'تحویل تکلیف'}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
