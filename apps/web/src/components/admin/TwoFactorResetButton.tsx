'use client'

import { Button } from '@payloadcms/ui'
import { useState } from 'react'

type State = 'idle' | 'confirm' | 'pending' | 'done' | 'error' | 'other-academy'

/** Confirm panel + POST /api/users/2fa/reset. Payload's own button styles (layout in custom.scss); no typed confirmation (UX §7.5). */
export function TwoFactorResetButton({ userId, name }: { userId: number; name: string }) {
  const [state, setState] = useState<State>('idle')

  async function reset() {
    setState('pending')
    try {
      const res = await fetch('/api/users/2fa/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) return setState('done')
      const body = (await res.json().catch(() => ({}))) as { reason?: string }
      setState(body.reason === 'other-academy' ? 'other-academy' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="field-type tfa-reset">
      <h4 className="tfa-reset__title">بازنشانی تأیید دومرحله‌ای</h4>
      {state === 'done' ? (
        <p role="status">تأیید دومرحله‌ای {name} بازنشانی شد.</p>
      ) : state === 'confirm' || state === 'pending' ? (
        <div role="alertdialog" aria-labelledby="tfr-title" aria-describedby="tfr-body">
          <p id="tfr-title">
            <strong>بازنشانی تأیید دومرحله‌ای برای {name}؟</strong>
          </p>
          <p id="tfr-body">
            کلید فعلی حذف می‌شود و {name} از همهٔ دستگاه‌ها خارج می‌شود. او با رمز عبور وارد می‌شود و در صورت لزوم دوباره تأیید دومرحله‌ای را فعال می‌کند. این کار در گزارش رویدادها ثبت می‌شود.
          </p>
          <div className="tfa-reset__actions">
            <Button buttonStyle="error" disabled={state === 'pending'} onClick={reset}>
              بازنشانی
            </Button>
            <Button buttonStyle="secondary" disabled={state === 'pending'} onClick={() => setState('idle')}>
              انصراف
            </Button>
          </div>
        </div>
      ) : (
        <>
          {state === 'error' ? <p role="alert">بازنشانی انجام نشد. دوباره تلاش کنید.</p> : null}
          {state === 'other-academy' ? <p role="alert">این کاربر در آکادمی دیگری هم کارمند است؛ بازنشانی فقط توسط پشتیبانی ادورا ممکن است.</p> : null}
          <Button buttonStyle="secondary" onClick={() => setState('confirm')}>
            بازنشانی تأیید دومرحله‌ای
          </Button>
        </>
      )}
    </div>
  )
}
