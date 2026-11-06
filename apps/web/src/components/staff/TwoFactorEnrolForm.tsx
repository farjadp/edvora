'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeField } from './CodeField'
import { requestSetup, submitCode, type CodeSubmit, type SetupSubmit, type TwoFactorSetupData } from './twoFactorClient'
import { TwoFactorLockout } from './TwoFactorLockout'
import { useCodeSubmit } from './useCodeSubmit'
import { btnPrimary, btnSecondary, ErrorText, Notice, PostButton } from './ui'

const enableCode = submitCode('enable')

export type TwoFactorEnrolFormProps = {
  /** `forced`: academy requires 2FA. Banner, no skip, only logout. `voluntary`: starts on «شروع», can cancel. */
  mode: 'voluntary' | 'forced'
  /** After success, «ادامه» goes here (full page load) unless `onDone` is given. */
  next: string
  /** Required in forced mode (the only exit). */
  logoutHref?: string
  /** Secret already created server-side. If omitted the form calls `onSetup` (forced: on mount; voluntary: on «شروع»). */
  initialSetup?: TwoFactorSetupData
  onSetup?: SetupSubmit
  onEnable?: CodeSubmit
  /** Voluntary mode: closes the flow without enabling. */
  onCancel?: () => void
  /** Replaces the default navigation on «ادامه» (used by the security page card). */
  onDone?: () => void
  /** Where a 409 (already enrolled) sends the user. */
  securityHref?: string
}

/** Groups the secret by 4 characters: ABCD EFGH … */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

export function TwoFactorEnrolForm({
  mode,
  next,
  logoutHref,
  initialSetup,
  onSetup = requestSetup,
  onEnable = enableCode,
  onCancel,
  onDone,
  securityHref = '/staff/security',
}: TwoFactorEnrolFormProps) {
  const [setup, setSetup] = useState<TwoFactorSetupData | null>(initialSetup ?? null)
  const [setupState, setSetupState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [conflict, setConflict] = useState(false)
  const [finished, setFinished] = useState(false)
  const [copied, setCopied] = useState(false)
  const s = useCodeSubmit()
  const started = useRef(false)
  const codeRef = useRef<HTMLInputElement>(null)

  const start = useCallback(async () => {
    setSetupState('loading')
    const r = await onSetup()
    if (r.kind === 'ok') {
      setSetup(r.data)
      setSetupState('idle')
    } else if (r.kind === 'conflict') {
      setConflict(true)
      setSetupState('idle')
    } else setSetupState('error')
  }, [onSetup])

  useEffect(() => {
    if (mode === 'forced' && !setup && !started.current) {
      started.current = true
      void start()
    }
  }, [mode, setup, start])

  async function copyKey() {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.secret.replace(/\s+/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard blocked: the key is still selectable on screen.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (s.pending || s.lockedUntil !== null) return
    const out = await s.run(onEnable)
    if (out === 'ok') setFinished(true)
    else if (out === 'conflict') setConflict(true)
  }

  const proceed = () => (onDone ? onDone() : window.location.assign(next))

  if (finished) {
    return (
      <div className="grid gap-4">
        <p role="status" className="rounded-xl border border-ok bg-sunken p-4 text-sm leading-7 text-ink">
          <strong className="block text-base text-ok">تأیید دومرحله‌ای فعال شد.</strong>
          از این پس در هر ورود جدید، کد را می‌پرسیم.
        </p>
        <button type="button" onClick={proceed} className={btnPrimary(true)}>
          ادامه
        </button>
      </div>
    )
  }

  if (conflict) {
    return (
      <div className="grid gap-4">
        <Notice>تأیید دومرحله‌ای برای حساب شما از قبل روشن است.</Notice>
        <a href={securityHref} className={btnPrimary(true)}>
          امنیت حساب
        </a>
      </div>
    )
  }

  const locked = s.lockedUntil !== null

  return (
    <div className="grid gap-6">
      {mode === 'forced' ? (
        <p className="rounded-xl border border-accent bg-sunken p-3 text-sm leading-7 text-ink">
          مدیر آکادمی تأیید دومرحله‌ای را برای همهٔ کارکنان الزامی کرده است. برای ادامه، آن را فعال کنید.
        </p>
      ) : null}

      {!setup ? (
        <div className="grid gap-4">
          {setupState === 'error' ? <ErrorText>مشکلی پیش آمد. دوباره تلاش کنید.</ErrorText> : null}
          {mode === 'forced' && setupState !== 'error' ? (
            <p role="status" className="text-sm text-muted">در حال ساخت کلید…</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={start} disabled={setupState === 'loading'} className={btnPrimary()}>
                {setupState === 'loading' ? 'در حال ساخت کلید…' : setupState === 'error' ? 'تلاش دوباره' : 'شروع'}
              </button>
              {mode === 'voluntary' && onCancel ? (
                <button type="button" onClick={onCancel} className={btnSecondary()}>
                  انصراف
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <ol className="grid gap-7">
          <li className="grid gap-1">
            <h3 className="font-bold">۱. یک برنامهٔ احراز هویت روی گوشی نصب کنید.</h3>
            <p className="text-sm text-muted">Google Authenticator، FreeOTP، Aegis یا مشابه.</p>
          </li>

          <li className="grid gap-4">
            <h3 className="font-bold">۲. کد QR را اسکن کنید.</h3>
            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              {setup.qrSvg ? (
                <div
                  role="img"
                  aria-label="کد QR تأیید دومرحله‌ای"
                  // Trusted SVG generated by our server from the otpauth URI; white keeps it scannable in dark mode.
                  className="mx-auto size-48 rounded-xl border border-line bg-white p-3 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
                />
              ) : null}
              <div className="grid min-w-0 gap-3">
                <a href={setup.otpauthUri} className={btnPrimary(true)}>
                  باز کردن در برنامهٔ احراز هویت
                </a>
                <p className="text-sm leading-7 text-muted">اگر نمی‌توانید اسکن کنید، این کلید را دستی وارد کنید:</p>
                <div className="flex flex-wrap items-center gap-3">
                  <code dir="ltr" className="min-w-0 break-all rounded-xl bg-sunken px-3 py-2 font-latin text-lg font-bold tracking-wider text-ink select-all">
                    {groupKey(setup.secret)}
                  </code>
                  <button type="button" onClick={copyKey} className={btnSecondary()}>
                    {copied ? 'کپی شد' : 'کپی کلید'}
                  </button>
                  <span role="status" className="sr-only">{copied ? 'کپی شد' : ''}</span>
                </div>
                <p className="text-xs leading-6 text-muted">با بارگذاری دوبارهٔ صفحه، کلید جدیدی ساخته می‌شود.</p>
              </div>
            </div>
          </li>

          <li className="grid gap-3">
            <h3 className="font-bold">۳. کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.</h3>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              {s.lockedUntil !== null ? <TwoFactorLockout lockedUntil={s.lockedUntil} onExpire={s.clearLock} /> : null}
              <CodeField label="کد تأیید" value={s.code} onChange={s.setCode} disabled={locked || s.pending} error={s.error} inputRef={codeRef} />
              {s.hint ? <Notice>{s.hint}</Notice> : null}
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={locked || s.pending} className={btnPrimary()}>
                  {s.pending ? 'در حال بررسی…' : 'فعال‌سازی'}
                </button>
                {mode === 'voluntary' && onCancel ? (
                  <button type="button" onClick={onCancel} className={btnSecondary()}>
                    انصراف
                  </button>
                ) : null}
              </div>
            </form>
          </li>
        </ol>
      )}

      <Notice tone="warn">اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند.</Notice>

      {mode === 'forced' && logoutHref ? <PostButton action={logoutHref}>خروج از حساب</PostButton> : null}
    </div>
  )
}

