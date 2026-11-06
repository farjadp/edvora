'use client'

import { cx } from '@edvora/ui'
import { useState } from 'react'
import { CodeField } from './CodeField'
import { submitCode, type CodeSubmit } from './twoFactorClient'
import { TwoFactorEnrolForm, type TwoFactorEnrolFormProps } from './TwoFactorEnrolForm'
import { TwoFactorLockout } from './TwoFactorLockout'
import { useCodeSubmit } from './useCodeSubmit'
import { btnDanger, btnPrimary, btnSecondary, Card, Notice } from './ui'

const disableCode = submitCode('disable')

export type TwoFactorStatusCardProps = {
  enabled: boolean
  /** Academy requires 2FA (STAFF_2FA_REQUIRED): no «خاموش‌کردن». */
  required: boolean
  /** Enrolment inputs reused for the inline «روشن‌کردن» flow. `mode` and `onDone` are set by this card. */
  enrol: Omit<TwoFactorEnrolFormProps, 'mode' | 'onDone' | 'onCancel'>
  onDisable?: CodeSubmit
  /** Called after a successful state change so the page can refresh server data. */
  onChanged?: (enabled: boolean) => void
}

export function TwoFactorStatusCard({ enabled: initial, required, enrol, onDisable = disableCode, onChanged }: TwoFactorStatusCardProps) {
  const [enabled, setEnabled] = useState(initial)
  const [panel, setPanel] = useState<'none' | 'enrol' | 'disable'>('none')
  const [notice, setNotice] = useState<string | null>(null)
  const s = useCodeSubmit()
  const locked = s.lockedUntil !== null

  async function submitDisable(e: React.FormEvent) {
    e.preventDefault()
    if (locked || s.pending) return
    const out = await s.run(onDisable)
    if (out === 'ok' || out === 'conflict') {
      setEnabled(false)
      setPanel('none')
      setNotice('تأیید دومرحله‌ای خاموش شد.')
      onChanged?.(false)
    }
  }

  return (
    <Card className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">تأیید دومرحله‌ای</h2>
        <span
          className={cx(
            'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-bold',
            enabled ? 'border-ok text-ok' : 'border-line-strong text-ink',
          )}
        >
          <span className={cx('size-2 rounded-full', enabled ? 'bg-ok' : 'bg-muted')} aria-hidden />
          {enabled ? 'روشن' : 'خاموش'}
        </span>
      </div>

      {notice ? <p role="status" className="rounded-xl border border-ok bg-sunken p-3 text-sm text-ink">{notice}</p> : null}

      {!enabled && panel !== 'enrol' ? (
        <>
          <p className="text-sm leading-7 text-muted">
            با روشن‌کردن آن، علاوه بر رمز عبور، کدی از گوشی شما هم لازم است. توصیه می‌کنیم روشن کنید.
          </p>
          <div>
            <button type="button" onClick={() => { setNotice(null); setPanel('enrol') }} className={btnPrimary()}>
              روشن‌کردن
            </button>
          </div>
        </>
      ) : null}

      {!enabled && panel === 'enrol' ? (
        <TwoFactorEnrolForm
          {...enrol}
          mode="voluntary"
          onCancel={() => setPanel('none')}
          onDone={() => {
            setEnabled(true)
            setPanel('none')
            setNotice('تأیید دومرحله‌ای فعال شد. از این پس در هر ورود جدید، کد را می‌پرسیم.')
            onChanged?.(true)
          }}
        />
      ) : null}

      {enabled && required ? (
        <Notice>تأیید دومرحله‌ای در این آکادمی الزامی است و خاموش نمی‌شود.</Notice>
      ) : null}

      {enabled && !required && panel === 'none' ? (
        <>
          <p className="text-sm leading-7 text-muted">در هر ورود جدید، علاوه بر رمز عبور، کدی از گوشی شما پرسیده می‌شود.</p>
          <div>
            <button type="button" onClick={() => { setNotice(null); setPanel('disable') }} className={btnSecondary()}>
              خاموش‌کردن
            </button>
          </div>
        </>
      ) : null}

      {enabled && !required && panel === 'disable' ? (
        <form onSubmit={submitDisable} className="grid gap-4 border-t border-line pt-5" noValidate>
          <p className="text-sm leading-7">برای خاموش‌کردن، کد فعلی را وارد کنید.</p>
          {s.lockedUntil !== null ? <TwoFactorLockout lockedUntil={s.lockedUntil} onExpire={s.clearLock} /> : null}
          <CodeField label="کد تأیید" value={s.code} onChange={s.setCode} disabled={locked || s.pending} error={s.error} />
          {s.hint ? <Notice>{s.hint}</Notice> : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={locked || s.pending} className={btnDanger()}>
              {s.pending ? 'در حال بررسی…' : 'خاموش‌کردن'}
            </button>
            <button type="button" onClick={() => setPanel('none')} className={btnSecondary()}>
              انصراف
            </button>
          </div>
        </form>
      ) : null}
    </Card>
  )
}
