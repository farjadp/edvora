'use client'

import { cx } from '@edvora/ui'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Card, ErrorText, Notice, btnPrimary, btnSecondary, fieldInput, linkClass } from '../staff/ui'
import { solvePow } from './solvePow'

export type Challenge = { token: string; nonce: string; bits: number }
type Creds = { email: string; password: string }
type Ready = { expiresAtFa: string; loginUrl: string; admin: Creds; student: Creds; certificateCode: string; leadSaved?: boolean }

export type DemoInitial =
  | { kind: 'form' }
  | { kind: 'continue'; remainingFa: string; expiresAtFa: string; loginUrl: string; hasCreator: boolean }
  | { kind: 'ended'; canCreate: boolean }
  | { kind: 'full'; nextFreeInFa: string | null }
  | { kind: 'rate-limited' }
  | { kind: 'disabled' }

type View = DemoInitial | { kind: 'working' } | ({ kind: 'ready' } & Ready)

export type DemoScreenProps = {
  initial: DemoInitial
  challenge: Challenge
  ttlFa: string
  minFillMs: number
  /** TODO(client): Farjad's preferred contact (Q4). Empty = the "talk to us" button opens the email form. */
  contactHref: string | null
}

const COPY = {
  generic: 'ساخت آکادمی آزمایشی انجام نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.',
  badEmail: 'ایمیل واردشده درست به نظر نمی‌رسد.',
  off: 'آکادمی آزمایشی موقتاً در دسترس نیست. لطفاً بعداً سر بزنید.',
  consent: 'می‌خواهم تیم ادورا دربارهٔ ادورا با من تماس بگیرد. ایمیل من فقط برای همین استفاده می‌شود.',
}

const CHECKLIST = [
  'یک دوره بسازید و قیمت و اقساط آن را تنظیم کنید.',
  'سرنخ‌ها را در میز مشاور ببینید و نتیجهٔ یک تماس را ثبت کنید.',
  'با حساب دانشجو وارد شوید، آزمون را بدهید و تکلیف بفرستید.',
  'یک سفارش آزمایشی را پرداخت کنید (پرداخت ساختگی است).',
  'برای یک همکار نقش و دسترسی دلخواه بسازید.',
  'گواهی نمونه را از صفحهٔ استعلام بررسی کنید.',
]

type ApiResult = { state: string; challenge?: Challenge; nextFreeInFa?: string | null } & Partial<Ready>

export function DemoScreen({ initial, challenge: firstChallenge, ttlFa, minFillMs, contactHref }: DemoScreenProps) {
  const [view, setView] = useState<View>(initial)
  const [error, setError] = useState<string | null>(null)
  const challenge = useRef(firstChallenge)
  const mountedAt = useRef(0)
  // Start solving as soon as the page is interactive, so the click usually finds the work already done.
  const solved = useRef<Promise<number> | null>(null)

  useEffect(() => {
    mountedAt.current = Date.now()
    if (initial.kind === 'form' || initial.kind === 'ended') solved.current = solvePow(firstChallenge.nonce, firstChallenge.bits)
  }, [initial.kind, firstChallenge])

  async function freshChallenge(next?: Challenge) {
    const ch = next ?? ((await fetch('/demo/api/challenge', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { challenge?: Challenge } | null)?.challenge
    if (ch) {
      challenge.current = ch
      mountedAt.current = Date.now()
      solved.current = solvePow(ch.nonce, ch.bits)
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (view.kind === 'working') return
    const form = new FormData(e.currentTarget)
    setError(null)
    setView({ kind: 'working' })
    try {
      const counter = await (solved.current ?? (solved.current = solvePow(challenge.current.nonce, challenge.current.bits)))
      // Time check (A2): the server refuses a submit within minFillMs of rendering the form.
      const wait = mountedAt.current + minFillMs + 300 - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      const res = await fetch('/demo/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          consent: form.get('consent') === 'on',
          website: String(form.get('website') ?? ''),
          token: challenge.current.token,
          counter,
        }),
      })
      const data = (await res.json().catch(() => ({ state: 'error' }))) as ApiResult
      solved.current = null
      switch (data.state) {
        case 'ready':
          if (!data.admin || !data.student) throw new Error('incomplete response')
          setView({ kind: 'ready', expiresAtFa: data.expiresAtFa ?? '', loginUrl: data.loginUrl ?? '', admin: data.admin, student: data.student, certificateCode: data.certificateCode ?? '', leadSaved: data.leadSaved })
          return
        case 'exists':
          window.location.assign('/demo')
          return
        case 'full':
          setView({ kind: 'full', nextFreeInFa: data.nextFreeInFa ?? null })
          return
        case 'rate-limited':
          setView({ kind: 'rate-limited' })
          return
        case 'disabled':
          setView({ kind: 'disabled' })
          return
        case 'invalid-email':
          setError(COPY.badEmail)
          break
        default:
          setError(COPY.generic)
      }
      await freshChallenge(data.challenge)
      setView({ kind: 'form' })
    } catch {
      setError(COPY.generic)
      await freshChallenge()
      setView({ kind: 'form' })
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:py-14">
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">
            ا
          </span>
          <span className="text-xl font-black">ادورا</span>
        </span>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">دمو</span>
      </header>
      <main className="grid gap-6">
        {view.kind === 'form' || view.kind === 'working' ? (
          <DemoForm working={view.kind === 'working'} error={error} ttlFa={ttlFa} onSubmit={create} />
        ) : null}
        {view.kind === 'ready' ? <Credentials ready={view} ttlFa={ttlFa} contactHref={contactHref} /> : null}
        {view.kind === 'continue' ? <Continue view={view} /> : null}
        {view.kind === 'ended' ? (
          <Ended canCreate={view.canCreate} onNew={() => setView({ kind: 'form' })} contactHref={contactHref} />
        ) : null}
        {view.kind === 'full' ? <Full nextFreeInFa={view.nextFreeInFa} /> : null}
        {view.kind === 'rate-limited' ? <RateLimited contactHref={contactHref} /> : null}
        {view.kind === 'disabled' ? (
          <Card>
            <h1 className="text-2xl font-black leading-10">آکادمی آزمایشی</h1>
            <p className="mt-3 leading-8 text-muted">{COPY.off}</p>
          </Card>
        ) : null}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- form (7.1)

function DemoForm({ working, error, ttlFa, onSubmit }: { working: boolean; error: string | null; ttlFa: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const [email, setEmail] = useState('')
  return (
    <Card>
      <h1 className="text-2xl font-black leading-10 sm:text-3xl">آکادمی خودتان را {ttlFa} ساعت آزمایش کنید</h1>
      <p className="mt-3 leading-8 text-muted">
        بدون ثبت‌نام و بدون پرداخت. یک آکادمی آزمایشی کامل با دوره، کلاس، آزمون، سرنخ و سفارش نمونه برای شما ساخته می‌شود. همه‌چیز پس از {ttlFa} ساعت پاک
        می‌شود.
      </p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {/* Honeypot (A1): invisible to people and assistive tech, filled by bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <label className="grid gap-2 text-sm font-bold">
          نام شما (اختیاری)
          <input name="name" type="text" maxLength={80} autoComplete="name" className={fieldInput} disabled={working} />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          ایمیل (اختیاری)
          <input
            name="email"
            type="email"
            inputMode="email"
            maxLength={200}
            autoComplete="email"
            dir="ltr"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cx(fieldInput, 'text-start font-latin')}
            disabled={working}
          />
        </label>
        {email.trim() ? (
          <label className="flex items-start gap-3 text-sm leading-7">
            <input name="consent" type="checkbox" className="mt-1.5 size-4 shrink-0 accent-brand" disabled={working} />
            <span>{COPY.consent}</span>
          </label>
        ) : null}
        <button type="submit" disabled={working} aria-busy={working} className={btnPrimary(true)}>
          {working ? 'در حال ساخت آکادمی شما…' : 'ساخت آکادمی آزمایشی'}
        </button>
        {working ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="در حال ساخت آکادمی شما">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
          </div>
        ) : null}
        <p className="text-sm leading-7 text-muted">پیامک و ایمیل واقعی ارسال نمی‌شود و پرداخت‌ها آزمایشی‌اند.</p>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------- credentials (7.3)

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      setDone(false)
    }
  }
  return (
    <button type="button" onClick={copy} className={cx(btnSecondary(), 'h-9 shrink-0 px-3 text-sm')} aria-label={`کپی ${label}`}>
      {done ? 'کپی شد' : 'کپی'}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2 text-start font-latin text-sm">
          {value}
        </code>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  )
}

function EnterButton({ role, children, primary }: { role: 'admin' | 'student'; children: ReactNode; primary?: boolean }) {
  return (
    <form method="post" action="/demo/enter">
      <input type="hidden" name="role" value={role} />
      <button type="submit" className={primary ? btnPrimary(true) : btnSecondary(true)}>
        {children}
      </button>
    </form>
  )
}

function Credentials({ ready, ttlFa, contactHref }: { ready: Ready; ttlFa: string; contactHref: string | null }) {
  const cards: { role: 'admin' | 'student'; title: string; creds: Creds; enter: string }[] = [
    { role: 'admin', title: 'مدیر آکادمی', creds: ready.admin, enter: 'ورود به‌عنوان مدیر' },
    { role: 'student', title: 'دانشجو', creds: ready.student, enter: 'ورود به‌عنوان دانشجو' },
  ]
  return (
    <>
      <Card>
        <h1 className="text-2xl font-black leading-10 sm:text-3xl">آکادمی آزمایشی شما آماده است</h1>
        <p className="mt-3 leading-8 text-muted">
          تا ساعت {ready.expiresAtFa} (حدود {ttlFa} ساعت دیگر) فعال است. این رمزها فقط یک بار نشان داده می‌شوند؛ همین حالا آن‌ها را کپی کنید.
        </p>
        {ready.leadSaved ? (
          <div className="mt-4">
            <Notice tone="ok">ایمیل شما ثبت شد؛ فقط برای تماس دربارهٔ ادورا. چیزی به آن فرستاده نمی‌شود.</Notice>
          </div>
        ) : null}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <section key={c.role} className="grid gap-4 rounded-2xl border border-line bg-surface p-5" aria-label={c.title}>
            <h2 className="text-lg font-black">{c.title}</h2>
            <Field label="نشانی ورود" value={ready.loginUrl} />
            <Field label="نام کاربری" value={c.creds.email} />
            <Field label="رمز عبور" value={c.creds.password} />
            <EnterButton role={c.role} primary={c.role === 'admin'}>
              {c.enter}
            </EnterButton>
          </section>
        ))}
      </div>
      <Card>
        <h2 className="text-lg font-black">در {ttlFa} ساعت چه چیزی را امتحان کنم؟</h2>
        <ol className="mt-4 grid list-inside list-decimal gap-2 leading-8">
          {CHECKLIST.map((item, i) => (
            <li key={item}>
              {item}
              {i === 5 && ready.certificateCode ? (
                <>
                  {' '}
                  <a className={linkClass} href={`/verify?code=${encodeURIComponent(ready.certificateCode)}`}>
                    <span dir="ltr" className="font-latin">
                      {ready.certificateCode}
                    </span>
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 leading-8 text-muted">اینجا دادهٔ واقعی وجود ندارد. هرچه می‌خواهید تغییر دهید یا حذف کنید.</p>
        <p className="mt-2 text-sm leading-7 text-muted">برای امتحان پرداخت ناموفق، در صفحهٔ درگاه ساختگی گزینهٔ «ناموفق» را بزنید.</p>
        <div className="mt-5">
          <TalkButton contactHref={contactHref} source="talk" />
        </div>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- returning visitor (C3, V4, V9)

function Continue({ view }: { view: Extract<DemoInitial, { kind: 'continue' }> }) {
  return (
    <Card>
      <h1 className="text-2xl font-black leading-10">آکادمی آزمایشی شما هنوز فعال است</h1>
      <p className="mt-3 leading-8 text-muted">
        {view.remainingFa} تا پایان (تا ساعت {view.expiresAtFa}). رمزها برای امنیت دوباره نشان داده نمی‌شوند.
      </p>
      {view.hasCreator ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <EnterButton role="admin" primary>
            ادامه به‌عنوان مدیر
          </EnterButton>
          <EnterButton role="student">ادامه به‌عنوان دانشجو</EnterButton>
        </div>
      ) : (
        <a className={cx(btnPrimary(true), 'mt-6')} href="/demo/login">
          ادامه
        </a>
      )}
      <p className="mt-5 text-sm leading-7 text-muted">
        نشانی ورود برای دستگاه دیگر:{' '}
        <span dir="ltr" className="font-latin">
          {view.loginUrl}
        </span>
      </p>
      <form method="post" action="/demo/leave" className="mt-4">
        <button type="submit" className={linkClass}>
          خروج از آکادمی آزمایشی در این مرورگر
        </button>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------- ended (7.7), full (7.5), rate-limited (7.6)

function Ended({ canCreate, onNew, contactHref }: { canCreate: boolean; onNew: () => void; contactHref: string | null }) {
  return (
    <Card>
      <h1 className="text-2xl font-black leading-10">زمان آکادمی آزمایشی شما تمام شد</h1>
      <p className="mt-3 leading-8 text-muted">برای حفظ امنیت، اطلاعات آزمایشی پاک می‌شود. اگر ادورا برای آکادمی شما مناسب بود، با ما صحبت کنید.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {canCreate ? (
          <button type="button" onClick={onNew} className={btnPrimary(true)}>
            ساخت آکادمی آزمایشی جدید
          </button>
        ) : null}
        <TalkButton contactHref={contactHref} source="expired-state" />
      </div>
    </Card>
  )
}

function Full({ nextFreeInFa }: { nextFreeInFa: string | null }) {
  return (
    <Card>
      <h1 className="text-2xl font-black leading-10">ظرفیت آکادمی‌های آزمایشی فعلاً پر است.</h1>
      <p className="mt-3 leading-8 text-muted">
        {nextFreeInFa ? `نزدیک‌ترین زمان آزاد شدن: حدود ${nextFreeInFa} دیگر. ` : ''}چند دقیقهٔ دیگر دوباره سر بزنید.
      </p>
      <p className="mt-2 leading-8">یا ایمیل بگذارید تا خودمان با شما هماهنگ کنیم.</p>
      <div className="mt-4">
        <InterestForm source="full-state" />
      </div>
    </Card>
  )
}

function RateLimited({ contactHref }: { contactHref: string | null }) {
  return (
    <Card>
      <h1 className="text-2xl font-black leading-10">درخواست‌های شما از حد مجاز گذشته است.</h1>
      <p className="mt-3 leading-8 text-muted">
        برای جلوگیری از سوءاستفاده، هر شبکه در ۲۴ ساعت فقط چند آکادمی آزمایشی می‌تواند بسازد. لطفاً بعداً دوباره تلاش کنید یا با ما تماس بگیرید.
      </p>
      <div className="mt-5">
        <TalkButton contactHref={contactHref} source="talk" />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- talk to us / leave an email (V8, F3)

type LeadSource = 'full-state' | 'expired-state' | 'talk'

function TalkButton({ contactHref, source }: { contactHref: string | null; source: LeadSource }) {
  const [open, setOpen] = useState(false)
  if (contactHref) {
    return (
      <a className={btnSecondary(true)} href={contactHref} rel="noopener">
        درخواست گفتگو با تیم ادورا
      </a>
    )
  }
  if (open) return <InterestForm source={source} />
  return (
    <button type="button" className={btnSecondary(true)} onClick={() => setOpen(true)}>
      درخواست گفتگو با تیم ادورا
    </button>
  )
}

function InterestForm({ source }: { source: LeadSource }) {
  const [state, setState] = useState<'idle' | 'sending' | 'saved' | 'error' | 'bad-email'>('idle')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setState('sending')
    const res = await fetch('/demo/api/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), consent: form.get('consent') === 'on', website: String(form.get('website') ?? ''), source }),
    }).catch(() => null)
    const data = (await res?.json().catch(() => null)) as { state?: string } | null
    setState(data?.state === 'saved' ? 'saved' : data?.state === 'invalid-email' ? 'bad-email' : 'error')
  }
  if (state === 'saved') return <Notice tone="ok">ثبت شد؛ فقط برای تماس دربارهٔ ادورا.</Notice>
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      {state === 'bad-email' ? <ErrorText>{COPY.badEmail}</ErrorText> : null}
      {state === 'error' ? <ErrorText>ثبت انجام نشد. لطفاً دوباره تلاش کنید.</ErrorText> : null}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="grid gap-2 text-sm font-bold">
        نام شما (اختیاری)
        <input name="name" type="text" maxLength={80} className={fieldInput} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        ایمیل
        <input name="email" type="email" inputMode="email" required maxLength={200} dir="ltr" spellCheck={false} className={cx(fieldInput, 'text-start font-latin')} />
      </label>
      <label className="flex items-start gap-3 text-sm leading-7">
        <input name="consent" type="checkbox" required className="mt-1.5 size-4 shrink-0 accent-brand" />
        <span>{COPY.consent}</span>
      </label>
      <button type="submit" disabled={state === 'sending'} className={btnPrimary(true)}>
        {state === 'sending' ? 'در حال ثبت…' : 'ثبت ایمیل'}
      </button>
    </form>
  )
}
