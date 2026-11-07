'use client'

import { focusRing } from '@edvora/ui/classes'
import { cx } from '@edvora/ui'
import { useState } from 'react'

/** Copies the certificate code. Falls back silently when the clipboard is blocked; the code stays selectable. */
export function CopyCode({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setState('copied')
          } catch {
            setState('failed')
          }
        }}
        className={cx('min-h-11 rounded-md border border-line-strong px-4 text-sm font-bold hover:bg-sunken', focusRing)}
      >
        رونوشت کد
      </button>
      <span role="status" className="text-sm text-muted">
        {state === 'copied' ? 'کد رونوشت شد.' : state === 'failed' ? 'رونوشت انجام نشد؛ کد را انتخاب و کپی کنید.' : ''}
      </span>
    </span>
  )
}
