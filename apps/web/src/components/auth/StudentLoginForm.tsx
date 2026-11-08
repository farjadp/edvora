'use client'

import { studentOtpReason } from '@edvora/core/login'
import { normalizeIranMobile } from '@edvora/core/phone'
import { cx } from '@edvora/ui'
import { SealIcon } from '@edvora/ui/seal'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { requestOtp, verifyOtp } from '../../app/(frontend)/actions'
import { AuthAlert, AuthHeading, AuthNotice, LockBanner, SupportLine, authLink } from './kit'
import { AuthField, CodeBoxes, PrimaryButton, ResendButton, ResendTimer, SecondaryButton } from './fields'

/** Matches the 60 s resend guard in requestOtp (shown as a fixed client timer; the server stays the authority). */
const RESEND_MS = 60 * 1000
const PHONE_PLACEHOLDER = '۰۹۱۲۳۴۵۶۷۸۹'

const COPY = {
  invalidPhone: 'شماره موبایل درست نیست. با ۰۹ شروع می‌شود و ۱۱ رقم دارد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹.',
  smsFailed: 'پیامک ارسال نشد. چند لحظه بعد دوباره امتحان کنید.',
  server: 'مشکلی پیش آمد. دوباره امتحان کنید.',
  network: 'اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.',
  alreadySent: 'کد چند لحظه پیش برایتان فرستاده شده. همان را وارد کنید.',
  wrongCode: 'کد درست نیست. دوباره بررسی کنید.',
  expired: 'کد منقضی شده است. کد تازه بگیرید.',
  tooMany: 'چند بار کد اشتباه وارد شد. کد تازه بگیرید.',
  inactive: 'ورود با این شماره ممکن نیست. با پشتیبانی آکادمی تماس بگیرید.',
  emptyCode: 'کد ۵رقمی را کامل وارد کنید.',
} as const

type PhoneProblem = { text: string; network?: boolean }
type CodeProblem = { kind: 'wrong' | 'expired' | 'locked' | 'inactive' | 'other'; text: string; network?: boolean }

type CodeView = { phone: string; sentAt: number; devCode?: string; alreadySent: boolean }

export type StudentLoginFormProps = {
  /** Same-site path validated by the page (and again by verifyOtp). */
  next: string
  /** S18: the visitor came from a protected page (`?next=` present). */
  showSessionNotice?: boolean
  /** Tenant `contact.phone`, shown with the suspended message (S15). */
  supportPhone?: string | null
  /** Ask for the name on the code step. The server does not say yet whether the number is new, so it is always asked. */
  askName?: boolean
  staffLoginHref?: string
  /** E-047: the academy's own login texts (settings hub); empty = the defaults. */
  texts?: { title?: string | null; subtitle?: string | null; help?: string | null } | null
}

/**
 * Student sign-in (E1, E-034 option B): mobile → SMS code. Calls the existing requestOtp / verifyOtp actions with the
 * same field names (phone, code, name, next); only the presentation of their results is new. Navigation after success is
 * a full page load to `redirectTo` (ADR 005).
 */
export function StudentLoginForm({ next, showSessionNotice = false, supportPhone, askName = true, staffLoginHref = '/staff/login', texts }: StudentLoginFormProps) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [view, setView] = useState<CodeView | null>(null)
  const [phoneProblem, setPhoneProblem] = useState<PhoneProblem | null>(null)
  const [codeProblem, setCodeProblem] = useState<CodeProblem | null>(null)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  const [requesting, startRequest] = useTransition()
  const [verifying, startVerify] = useTransition()
  const phoneRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo)
  }, [redirectTo])

  // Step change: focus the field of the new step (spec §4). The phone field is not autofocused on first load.
  const sentAt = view?.sentAt ?? 0
  useEffect(() => {
    if (sentAt) codeRef.current?.focus()
  }, [sentAt])

  function send(form: FormData) {
    const resend = view !== null
    startRequest(async () => {
      try {
        const r = await requestOtp(null, form)
        const reason = r ? studentOtpReason(r) : 'unknown'
        if (r?.ok && r.step === 'code' && r.phone) {
          setView({ phone: r.phone, sentAt: Date.now(), devCode: r.devCode, alreadySent: reason === 'already-sent' })
          setPhoneProblem(null)
          setCodeProblem(null)
          setCode('')
          return
        }
        const text = reason === 'invalid-phone' ? COPY.invalidPhone : reason === 'sms-failed' ? COPY.smsFailed : reason === 'server' ? COPY.server : r?.message || COPY.server
        if (resend) setCodeProblem({ kind: 'other', text })
        else {
          setPhoneProblem({ text })
          phoneRef.current?.focus()
        }
      } catch {
        if (resend) setCodeProblem({ kind: 'other', text: COPY.network, network: true })
        else setPhoneProblem({ text: COPY.network, network: true })
      }
    })
  }

  function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (requesting) return
    if (!normalizeIranMobile(phone)) {
      setPhoneProblem({ text: COPY.invalidPhone })
      phoneRef.current?.focus()
      return
    }
    send(new FormData(e.currentTarget))
  }

  function onResend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!requesting) send(new FormData(e.currentTarget))
  }

  function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (verifying || redirectTo) return
    if (code.length !== 5) {
      setCodeProblem({ kind: 'wrong', text: COPY.emptyCode })
      codeRef.current?.focus()
      return
    }
    const form = new FormData(e.currentTarget)
    startVerify(async () => {
      try {
        const r = await verifyOtp(null, form)
        const reason = r ? studentOtpReason(r) : 'unknown'
        if (r?.ok && r.redirectTo) {
          setCodeProblem(null)
          setRedirectTo(r.redirectTo)
          return
        }
        switch (reason) {
          case 'invalid-phone':
            backToPhone({ text: COPY.invalidPhone })
            return
          case 'wrong-code':
            setCodeProblem({ kind: 'wrong', text: COPY.wrongCode })
            break
          case 'expired':
            setCodeProblem({ kind: 'expired', text: COPY.expired })
            break
          case 'too-many':
            setCodeProblem({ kind: 'locked', text: COPY.tooMany })
            break
          case 'inactive':
            setCodeProblem({ kind: 'inactive', text: COPY.inactive })
            return
          default:
            setCodeProblem({ kind: 'other', text: r?.message || COPY.server })
        }
        setCode('')
        codeRef.current?.focus()
      } catch {
        setCodeProblem({ kind: 'other', text: COPY.network, network: true })
      }
    })
  }

  function backToPhone(problem: PhoneProblem | null = null) {
    setView(null)
    setCode('')
    setCodeProblem(null)
    setPhoneProblem(problem)
    // The phone step renders on the next commit; focus it then.
    window.requestAnimationFrame(() => phoneRef.current?.focus())
  }

  if (view) {
    const resendForm = (primary: boolean) => (
      <form onSubmit={onResend} aria-busy={requesting || undefined}>
        <input type="hidden" name="phone" value={view.phone} />
        {primary ? (
          <PrimaryButton busy={requesting}>{requesting ? 'در حال ارسال…' : 'کد نرسید؟ ارسال دوباره'}</PrimaryButton>
        ) : (
          <ResendButton busy={requesting} />
        )}
      </form>
    )
    const phoneLtr = (
      <span dir="ltr" className="inline-block font-latin font-bold tabular-nums">
        {view.phone}
      </span>
    )
    const editPhone = (
      <button type="button" onClick={() => backToPhone()} className={cx(authLink, 'text-sm')}>
        <SealIcon name="pencil" className="me-1.5 size-4" />
        ویرایش شماره
      </button>
    )

    return (
      <>
        <AuthHeading title="کد را وارد کنید" />
        <div className="mt-7">
          {view.devCode ? (
            <p className="mb-5 rounded-md bg-sunken p-3 text-sm">
              حالت توسعه (پیامک آزمایشی): کد <span className="font-latin font-bold">{view.devCode}</span>
            </p>
          ) : null}

          {codeProblem?.kind === 'locked' ? (
            <>
              <LockBanner>{codeProblem.text}</LockBanner>
              {resendForm(true)}
              <p className="mt-6 text-sm text-muted">
                شمارهٔ {phoneLtr} را اشتباه نوشته‌اید؟ {editPhone}
              </p>
            </>
          ) : codeProblem?.kind === 'inactive' ? (
            <>
              <AuthAlert>{codeProblem.text}</AuthAlert>
              {supportPhone ? <SupportLine label="پشتیبانی آکادمی:" phone={supportPhone} /> : null}
              <div className="mt-6 grid gap-3">
                <SecondaryButton onClick={() => backToPhone()}>بازگشت</SecondaryButton>
              </div>
            </>
          ) : (
            <>
              <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 leading-7">
                <span>کد ۵رقمی به {phoneLtr} پیامک شد.</span>
                {editPhone}
              </p>
              {view.alreadySent && !codeProblem ? <AuthNotice>{COPY.alreadySent}</AuthNotice> : null}
              <form onSubmit={onVerify} aria-busy={verifying || undefined} noValidate>
                <input type="hidden" name="phone" value={view.phone} />
                <input type="hidden" name="next" value={next} />
                <div className="grid gap-5">
                  <CodeBoxes
                    label="کد ورود"
                    length={5}
                    name="code"
                    value={code}
                    onChange={(v) => {
                      setCode(v)
                      if (codeProblem?.kind === 'wrong') setCodeProblem(null)
                    }}
                    disabled={Boolean(redirectTo)}
                    invalid={codeProblem?.kind === 'wrong'}
                    describedBy="code-alert"
                    inputRef={codeRef}
                  />
                  {askName ? (
                    <AuthField id="name" name="name" label="نام و نام خانوادگی (فقط بار اول)" autoComplete="name" value={name} onChange={setName} readOnly={verifying} />
                  ) : null}
                </div>
                <div className="mt-5">
                  <AuthAlert id="code-alert">{codeProblem?.text}</AuthAlert>
                  {redirectTo ? (
                    <p role="status" className="mb-5 flex items-center gap-2.5 text-sm font-medium">
                      <SealIcon name="check" className="text-ok" />
                      وارد شدید.
                    </p>
                  ) : null}
                </div>
                <PrimaryButton busy={verifying || Boolean(redirectTo)}>{verifying || redirectTo ? 'در حال ورود…' : 'ورود'}</PrimaryButton>
              </form>
              <div className="mt-4">
                {codeProblem?.kind === 'expired' ? (
                  resendForm(false)
                ) : (
                  <ResendTimer key={view.sentAt} until={view.sentAt + RESEND_MS} resend={resendForm(false)} busy={requesting} />
                )}
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <AuthHeading title={texts?.title?.trim() || 'ورود یا ثبت‌نام'} sub={texts?.subtitle?.trim() || 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.'} />
      <div className="mt-7">
        {showSessionNotice ? <AuthNotice>برای ادامه، وارد شوید.</AuthNotice> : null}
        <form id="phone-form" onSubmit={onRequest} aria-busy={requesting || undefined} noValidate>
          <AuthField
            id="phone"
            name="phone"
            type="tel"
            label="شماره موبایل"
            latin
            inputMode="tel"
            autoComplete="tel"
            placeholder={PHONE_PLACEHOLDER}
            required
            value={phone}
            onChange={(v) => {
              setPhone(v)
              if (phoneProblem && !phoneProblem.network) setPhoneProblem(null)
            }}
            readOnly={requesting}
            invalid={phoneProblem?.text === COPY.invalidPhone}
            describedBy="phone-alert"
            inputRef={phoneRef}
          />
          <div className="mt-5">
            <AuthAlert id="phone-alert">{phoneProblem?.text}</AuthAlert>
          </div>
          <PrimaryButton busy={requesting}>{requesting ? 'در حال ارسال…' : 'دریافت کد ورود'}</PrimaryButton>
          {phoneProblem?.network ? (
            <div className="mt-4">
              <button type="submit" disabled={requesting} className={cx(authLink, 'gap-2 disabled:opacity-60')}>
                <SealIcon name="wifi-off" className="size-4" />
                تلاش دوباره
              </button>
            </div>
          ) : null}
        </form>
        {texts?.help?.trim() ? (
          <p className="mt-6 text-sm leading-7 text-muted" data-testid="login-help">
            {texts.help.trim()}
          </p>
        ) : null}
        <p className="mt-6 text-sm text-muted">
          کارمند آکادمی هستید؟{' '}
          <a href={staffLoginHref} className={cx(authLink, 'text-sm')}>
            ورود کارکنان
          </a>
        </p>
      </div>
    </>
  )
}
