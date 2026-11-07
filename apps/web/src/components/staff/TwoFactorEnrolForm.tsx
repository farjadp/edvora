'use client'

import { cx } from '@edvora/ui'
import { SealIcon } from '@edvora/ui/seal'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CodeBoxes, LockCountdown, PrimaryButton, SecondaryButton, UnlockedStatus } from '../auth/fields'
import { AuthAlert, AuthNotice, AuthPostButton, authPrimary, authSecondary } from '../auth/kit'
import { requestSetup, submitCode, type CodeSubmit, type SetupSubmit, type TwoFactorSetupData } from './twoFactorClient'
import { useCodeSubmit } from './useCodeSubmit'

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
  const [unlocked, setUnlocked] = useState(false)
  const { clearLock } = s
  const onExpire = useCallback(() => {
    clearLock()
    setUnlocked(true)
  }, [clearLock])
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
    setUnlocked(false)
    const out = await s.run(onEnable)
    if (out === 'ok') setFinished(true)
    else if (out === 'conflict') setConflict(true)
    else codeRef.current?.focus()
  }

  const proceed = () => (onDone ? onDone() : window.location.assign(next))

  if (finished) {
    return (
      <div className="grid gap-4">
        <div role="status" className="flex items-start gap-2.5 rounded-md border border-ok p-4 leading-7">
          <SealIcon name="check" className="mt-1 text-ok" />
          <p>
            <strong className="block text-ok">تأیید دومرحله‌ای فعال شد.</strong>
            <span className="text-sm">از این پس در هر ورود جدید، کد را می‌پرسیم.</span>
          </p>
        </div>
        <PrimaryButton type="button" onClick={proceed}>
          ادامه
        </PrimaryButton>
      </div>
    )
  }

  if (conflict) {
    return (
      <div className="grid gap-4">
        <AuthNotice>تأیید دومرحله‌ای برای حساب شما از قبل روشن است.</AuthNotice>
        <a href={securityHref} className={authPrimary}>
          امنیت حساب
        </a>
      </div>
    )
  }

  const locked = s.lockedUntil !== null
  const step = (n: string, title: string, children?: ReactNode) => (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-line-strong font-display text-lg font-black">
        {n}
      </span>
      <div className="grid min-w-0 gap-3 pt-0.5">
        <h3 className="font-bold leading-7">
          <span className="sr-only">{n}. </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  )

  return (
    <div className="grid gap-6">
      {mode === 'forced' ? (
        <p className="flex items-start gap-2.5 border-s-4 border-accent ps-4 text-sm leading-7">
          مدیر آکادمی تأیید دومرحله‌ای را برای همهٔ کارکنان الزامی کرده است. برای ادامه، آن را فعال کنید.
        </p>
      ) : null}

      <p role="note" className="flex items-start gap-2.5 border-s-4 border-accent ps-4 text-sm leading-7">
        <SealIcon name="alert" className="mt-1" />
        اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند.
      </p>

      {!setup ? (
        <div className="grid gap-4" aria-busy={setupState === 'loading' || undefined}>
          <AuthAlert>{setupState === 'error' ? 'مشکلی پیش آمد. دوباره تلاش کنید.' : null}</AuthAlert>
          {mode === 'forced' && setupState !== 'error' ? (
            <div role="status" className="grid gap-3">
              <span className="sr-only">در حال ساخت کلید…</span>
              <span aria-hidden="true" className="h-4 w-2/3 rounded-sm bg-sunken" />
              <span aria-hidden="true" className="mx-auto size-40 rounded-md bg-sunken" />
              <span aria-hidden="true" className="h-4 w-1/2 rounded-sm bg-sunken" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <PrimaryButton type="button" onClick={start} busy={setupState === 'loading'}>
                {setupState === 'loading' ? 'در حال ساخت کلید…' : setupState === 'error' ? 'تلاش دوباره' : 'شروع'}
              </PrimaryButton>
              {mode === 'voluntary' && onCancel ? <SecondaryButton onClick={onCancel}>انصراف</SecondaryButton> : null}
            </div>
          )}
        </div>
      ) : (
        <ol className="grid gap-7">
          {step('۱', 'یک برنامهٔ احراز هویت روی گوشی نصب کنید.', <p className="text-sm text-muted">Google Authenticator، FreeOTP، Aegis یا مشابه.</p>)}
          {step(
            '۲',
            'کد QR را اسکن کنید.',
            <>
              {setup.qrSvg ? (
                <div
                  role="img"
                  aria-label="کد QR تأیید دومرحله‌ای"
                  // Trusted SVG generated by our server from the otpauth URI; white keeps it scannable in dark mode.
                  className="size-44 rounded-md border border-line-strong bg-white p-2.5 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
                />
              ) : null}
              <a href={setup.otpauthUri} className={authSecondary}>
                باز کردن در برنامهٔ احراز هویت
              </a>
              <p className="text-sm leading-7 text-muted">اگر نمی‌توانید اسکن کنید، این کلید را دستی وارد کنید:</p>
              <div className="flex flex-wrap items-center gap-3">
                <code dir="ltr" className="min-w-0 select-all break-all rounded-md bg-sunken px-3 py-2 font-latin text-sm font-bold tracking-wider text-ink">
                  {groupKey(setup.secret)}
                </code>
                <button type="button" onClick={copyKey} className={cx(authSecondary, 'w-auto')}>
                  {copied ? 'کپی شد' : 'کپی کلید'}
                </button>
                <span role="status" className="sr-only">
                  {copied ? 'کپی شد' : ''}
                </span>
              </div>
              <p className="text-xs leading-6 text-muted">با بارگذاری دوبارهٔ صفحه، کلید جدیدی ساخته می‌شود.</p>
            </>,
          )}
          {step(
            '۳',
            'کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.',
            <form onSubmit={submit} aria-busy={s.pending || undefined} noValidate>
              {s.lockedUntil !== null ? (
                <LockCountdown text="چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید." lockedUntil={s.lockedUntil} onExpire={onExpire} />
              ) : null}
              {unlocked && !locked ? <UnlockedStatus /> : null}
              <CodeBoxes
                label="کد تأیید"
                length={6}
                value={s.code}
                onChange={s.setCode}
                disabled={locked || s.pending}
                invalid={Boolean(s.error)}
                hint={s.hint}
                describedBy="enrol-alert"
                inputRef={codeRef}
              />
              <div className="mt-5">
                <AuthAlert id="enrol-alert">{locked ? null : s.error}</AuthAlert>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PrimaryButton busy={s.pending} disabled={locked}>
                  {s.pending ? 'در حال بررسی…' : 'فعال‌سازی'}
                </PrimaryButton>
                {mode === 'voluntary' && onCancel ? <SecondaryButton onClick={onCancel}>انصراف</SecondaryButton> : null}
              </div>
            </form>,
          )}
        </ol>
      )}

      {mode === 'forced' && logoutHref ? <AuthPostButton action={logoutHref}>خروج از حساب</AuthPostButton> : null}
    </div>
  )
}
