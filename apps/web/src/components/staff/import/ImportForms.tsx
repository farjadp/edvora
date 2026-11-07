'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  confirmImportAction,
  createConnectionAction,
  purgeNowAction,
  resolveConflictAction,
  revokeConnectionAction,
  saveChoicesAction,
  setHeldPhoneAction,
  startRestAction,
  uploadBundleAction,
  type ImportActionState,
} from '../../../app/(frontend)/staff/(desk)/import/actions'
import { btnDanger, btnPrimary, btnSecondary, ErrorText, fieldInput, Notice } from '../ui'

type Action = (prev: ImportActionState, form: FormData) => Promise<ImportActionState>

/** Full navigation on `redirectTo` (keeps the Host header, ADR 005). */
function useNavigate(state: ImportActionState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo)
  }, [state?.redirectTo])
}

function Feedback({ state }: { state: ImportActionState }) {
  if (!state || state.redirectTo) return null
  return state.ok ? <Notice tone="ok">{state.message}</Notice> : <ErrorText>{state.message}</ErrorText>
}

function useImportAction(action: Action) {
  const [state, run, pending] = useActionState<ImportActionState, FormData>(action, null)
  useNavigate(state)
  return { state, run, pending }
}

const label = 'grid gap-2 text-sm font-bold'
const hint = 'text-sm font-normal leading-7 text-muted'

export function CopyButton({ value, labelText = 'کپی' }: { value: string; labelText?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={btnSecondary()}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? 'کپی شد ✓' : labelText}
    </button>
  )
}

// ---------------------------------------------------------------- start

export function CreateConnectionForm({ siteUrl }: { siteUrl: string }) {
  const { state, run, pending } = useImportAction(createConnectionAction)
  if (state?.ok && state.secret && state.connectionId) {
    return (
      <div className="grid gap-4" data-testid="connection-secret">
        <Notice tone="warn">این کد فقط همین یک بار نمایش داده می‌شود. آن را همین حالا در افزونهٔ «Edvora Migrator» وارد کنید.</Notice>
        <dl className="grid gap-3 text-sm">
          <div className="grid gap-1">
            <dt className="text-muted">نشانی ادوورا</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 break-all rounded-lg bg-sunken px-3 py-2 font-latin">{siteUrl}</code>
              <CopyButton value={siteUrl} />
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted">شناسهٔ اتصال</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 break-all rounded-lg bg-sunken px-3 py-2 font-latin">{state.connectionId}</code>
              <CopyButton value={state.connectionId} />
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted">کد محرمانه</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 break-all rounded-lg bg-sunken px-3 py-2 font-latin" data-testid="secret-value">{state.secret}</code>
              <CopyButton value={state.secret} labelText="کپی کد" />
            </dd>
          </div>
        </dl>
        {state.jobId ? (
          <a href={`/staff/import/${state.jobId}`} className={btnPrimary()}>
            رفتن به صفحهٔ این انتقال
          </a>
        ) : null}
      </div>
    )
  }
  return (
    <form action={run} className="grid gap-4">
      <label className={label}>
        نام این انتقال
        <input name="label" required minLength={2} maxLength={80} placeholder="مثلاً سایت فعلی آکادمی" className={fieldInput} />
      </label>
      <input type="hidden" name="mode" value="push" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={btnPrimary()}>
        {pending ? 'در حال ساخت…' : 'ساخت اتصال و کد یک‌بارمصرف'}
      </button>
    </form>
  )
}

export function RevokeButton({ connectionId, back }: { connectionId: string; back?: string }) {
  const { state, run, pending } = useImportAction(revokeConnectionAction)
  return (
    <form action={run} className="grid gap-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <button type="submit" disabled={pending} className={btnSecondary()}>
        {pending ? '…' : 'لغو اتصال'}
      </button>
      <Feedback state={state} />
    </form>
  )
}

export function UploadBundleForm() {
  const { state, run, pending } = useImportAction(uploadBundleAction)
  return (
    <form action={run} className="grid gap-4">
      <label className={label}>
        فایل خروجی افزونه
        <span className={hint}>فایلی با پسوند ‎.edvora-bundle‎ که در وردپرس از «ابزارها › Edvora Migrator › دریافت فایل» گرفته‌اید.</span>
        <input name="bundle" type="file" required accept=".edvora-bundle,application/gzip" className={cx(fieldInput, 'py-2')} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={btnPrimary()}>
        {pending ? 'در حال بررسی فایل…' : 'بارگذاری و بررسی'}
      </button>
    </form>
  )
}

export function RestForm() {
  const { state, run, pending } = useImportAction(startRestAction)
  return (
    <form action={run} className="grid gap-4" autoComplete="off">
      <label className={label}>
        نشانی سایت وردپرس
        <input name="siteUrl" type="url" required dir="ltr" placeholder="https://example.ir" className={fieldInput} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          نام کاربری مدیر
          <input name="username" required dir="ltr" className={fieldInput} />
        </label>
        <label className={label}>
          رمز برنامه (Application Password)
          <input name="applicationPassword" type="password" required dir="ltr" className={fieldInput} />
        </label>
      </div>
      <details className="rounded-xl border border-line p-4">
        <summary className={cx('cursor-pointer text-sm font-bold', focusRing)}>کلیدهای ووکامرس و LifterLMS (اختیاری)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Woo consumer key
            <input name="wooKey" dir="ltr" className={fieldInput} />
          </label>
          <label className={label}>
            Woo consumer secret
            <input name="wooSecret" type="password" dir="ltr" className={fieldInput} />
          </label>
          <label className={label}>
            LifterLMS key
            <input name="llmsKey" dir="ltr" className={fieldInput} />
          </label>
          <label className={label}>
            LifterLMS secret
            <input name="llmsSecret" type="password" dir="ltr" className={fieldInput} />
          </label>
        </div>
      </details>
      <Notice>رمزها فقط برای همین انتقال، رمزنگاری‌شده نگه داشته و پس از پایان آن پاک می‌شوند. این روش شمارهٔ موبایل‌هایی را که در افزونه‌های پیامکی ذخیره شده‌اند نمی‌بیند.</Notice>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={btnPrimary()}>
        {pending ? 'در حال اتصال و بررسی…' : 'اتصال و بررسی'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- dry run

export type ProductRow = {
  productWpId: string
  productTitle: string
  method: string
  courseRefKey: string | null
  courseId: number | string | null
  candidates: { refKey: string; title: string }[]
  usage: number
}

export function ChoicesForm({
  jobId,
  lms,
  products,
  courseOptions,
  existingCourses,
  hosts,
  disabled,
  children,
}: {
  jobId: number
  lms: { conflict: boolean; current: string | null } | null
  products: ProductRow[]
  courseOptions: { refKey: string; title: string }[]
  existingCourses: { id: number; title: string }[]
  hosts: { host: string; count: number; approved: boolean }[]
  disabled: boolean
  children?: ReactNode
}) {
  const { state, run, pending } = useImportAction(saveChoicesAction)
  const valueOf = (p: ProductRow) => (p.method === 'skip' ? 'skip' : p.method === 'standalone' ? 'standalone' : p.courseRefKey ? `ref:${p.courseRefKey}` : p.courseId !== null ? `id:${p.courseId}` : '')
  return (
    <form action={run} className="grid gap-6">
      <input type="hidden" name="jobId" value={jobId} />
      {lms?.conflict ? (
        <fieldset className="grid gap-3">
          <legend className="text-base font-black">کدام سامانهٔ آموزشی منتقل شود؟</legend>
          <p className={hint}>روی سایت هم LifterLMS و هم Tutor فعال است. یکی را برای انتقال دوره‌ها، جلسه‌ها و ثبت‌نام‌ها انتخاب کنید.</p>
          {(['lifterlms', 'tutor'] as const).map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-4">
              <input type="radio" name="lms" value={m} defaultChecked={lms.current === m} disabled={disabled} />
              <span className="font-latin">{m === 'lifterlms' ? 'LifterLMS' : 'Tutor LMS'}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {products.length ? (
        <div className="grid gap-3">
          <h3 className="text-base font-black">محصول‌های ووکامرس و دوره‌ها</h3>
          <p className={hint}>هر محصولی که سفارش دارد باید به یک دوره وصل شود؛ تا وقتی مشخص نشود، سفارش‌های آن منتقل نمی‌شوند.</p>
          <ul className="grid gap-3">
            {products.map((p) => (
              <li key={p.productWpId} className="grid gap-2 rounded-xl border border-line p-4 sm:grid-cols-[1fr_minmax(0,18rem)] sm:items-center">
                <div className="min-w-0">
                  <p className="font-bold">{p.productTitle}</p>
                  <p className="text-sm text-muted">
                    {toPersianDigits(p.usage)} سفارش یا عضویت · {p.method === 'unmapped' ? <strong className="text-danger">نامشخص</strong> : 'مشخص'}
                  </p>
                </div>
                <input type="hidden" name={`auto:${p.productWpId}`} value={valueOf(p)} />
                <label className="grid gap-1 text-sm">
                  <span className="sr-only">دورهٔ محصول {p.productTitle}</span>
                  <select name={`product:${p.productWpId}`} defaultValue={valueOf(p)} disabled={disabled} className={fieldInput} data-testid={`product-${p.productWpId}`}>
                    <option value="">— انتخاب کنید —</option>
                    <optgroup label="دوره‌های همین انتقال">
                      {courseOptions.map((c) => (
                        <option key={c.refKey} value={`ref:${c.refKey}`}>
                          {c.title}
                          {p.candidates.some((x) => x.refKey === c.refKey) ? ' (پیشنهاد)' : ''}
                        </option>
                      ))}
                    </optgroup>
                    {existingCourses.length ? (
                      <optgroup label="دوره‌های موجود در ادوورا">
                        {existingCourses.map((c) => (
                          <option key={c.id} value={`id:${c.id}`}>
                            {c.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <option value="standalone">خود محصول یک دورهٔ جدا شود</option>
                    <option value="skip">دوره نیست؛ سفارش‌هایش منتقل نشود</option>
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hosts.length ? (
        <fieldset className="grid gap-3">
          <legend className="text-base font-black">دامنه‌های فایل‌های رسانه</legend>
          <p className={hint}>فایل‌ها فقط از دامنهٔ سایت شما دریافت می‌شوند. اگر تصویرها روی CDN یا دامنهٔ دیگری‌اند، آن دامنه را تأیید کنید.</p>
          {hosts.map((h) => (
            <label key={h.host} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-4">
              <input type="checkbox" name="approveHost" value={h.host} defaultChecked={h.approved} disabled={disabled} />
              <span dir="ltr" className="font-latin">{h.host}</span>
              <span className="text-sm text-muted">({toPersianDigits(h.count)} فایل)</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {children}
      <Feedback state={state} />
      {!disabled ? (
        <button type="submit" disabled={pending} className={btnSecondary()}>
          {pending ? 'در حال ساخت گزارش…' : 'ذخیره و بررسی دوباره'}
        </button>
      ) : null}
    </form>
  )
}

export function HeldPhoneForm({ jobId, wpId, name }: { jobId: number; wpId: string; name: string }) {
  const { state, run, pending } = useImportAction(setHeldPhoneAction)
  return (
    <form action={run} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="wpId" value={wpId} />
      <label className="sr-only" htmlFor={`held-${wpId}`}>
        موبایل {name}
      </label>
      <input id={`held-${wpId}`} name="phone" required inputMode="tel" dir="ltr" placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷" className={cx(fieldInput, 'w-44 text-end')} />
      <button type="submit" disabled={pending} className={btnSecondary()}>
        {pending ? '…' : 'افزودن شماره'}
      </button>
      {state && !state.ok ? <p role="alert" className="w-full text-sm text-danger">{state.message}</p> : null}
    </form>
  )
}

export function ConfirmImport({ jobId, lines, blocked }: { jobId: number; lines: string[]; blocked: boolean }) {
  const { state, run, pending } = useImportAction(confirmImportAction)
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <div className="grid gap-3">
      <button type="button" disabled={blocked} className={btnPrimary(true)} onClick={() => dialog.current?.showModal()}>
        اجرای انتقال
      </button>
      {blocked ? <p className="text-sm text-muted">تا موارد مسدودکننده برطرف نشوند، اجرا ممکن نیست.</p> : null}
      <Feedback state={state} />
      <dialog ref={dialog} aria-labelledby="confirm-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-ink backdrop:bg-ink/40">
        <form action={run} className="grid gap-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="confirm" value="yes" />
          <h2 id="confirm-title" className="text-xl font-black">
            اجرای انتقال؟
          </h2>
          <ul className="grid gap-1 text-sm leading-7">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <Notice tone="ok">هیچ چیزی از سایت وردپرس شما حذف نمی‌شود.</Notice>
          <p className="text-sm leading-7 text-muted">انتقال در پس‌زمینه انجام می‌شود؛ می‌توانید این صفحه را ببندید و بعداً برگردید.</p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={btnPrimary()}>
              {pending ? 'در حال شروع…' : 'بله، اجرا شود'}
            </button>
            <button type="button" className={btnSecondary()} onClick={() => dialog.current?.close()}>
              انصراف
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}

// ---------------------------------------------------------------- progress + summary

type Progress = { status: string; phase?: string; media?: { done: number; total: number }; records?: { done: number; total: number }; error?: string | null }

/** Polls the progress route every 2 s (display only) and reloads the page when the job leaves the running state. */
export function ProgressPoller({ jobId, initial }: { jobId: number; initial: Progress }) {
  const [p, setP] = useState<Progress>(initial)
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const res = await fetch(`/staff/import/${jobId}/state`, { cache: 'no-store' })
        if (res.ok) {
          const next = (await res.json()) as Progress
          if (stop) return
          setP(next)
          if (next.status !== 'media' && next.status !== 'committing' && next.status !== 'dry-run' && next.status !== 'ready' && next.status !== 'ingesting') {
            window.location.reload()
            return
          }
        }
      } catch {
        /* keep polling */
      }
      if (!stop) setTimeout(tick, 2000)
    }
    const t = setTimeout(tick, 2000)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [jobId])
  const bar = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 100)
  const rows: [string, { done: number; total: number } | undefined][] = [
    ['رسانه‌ها', p.media],
    ['رکوردها', p.records],
  ]
  return (
    <div className="grid gap-4" role="status" aria-live="polite" data-testid="import-progress">
      {rows.map(([name, v]) => (
        <div key={name} className="grid gap-2">
          <div className="flex justify-between text-sm">
            <span className="font-bold">{name}</span>
            <span className="text-muted">{v ? `${toPersianDigits(v.done)} از ${toPersianDigits(v.total)}` : '—'}</span>
          </div>
          <progress className="h-3 w-full accent-brand" max={100} value={v ? bar(v.done, v.total) : 0} />
        </div>
      ))}
    </div>
  )
}

export function ConflictButtons({ jobId, refKey }: { jobId: number; refKey: string }) {
  const { state, run, pending } = useImportAction(resolveConflictAction)
  return (
    <form action={run} className="flex flex-wrap gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="refKey" value={refKey} />
      <button type="submit" name="choice" value="keep" disabled={pending} className={btnSecondary()}>
        نسخهٔ ادوورا بماند
      </button>
      <button type="submit" name="choice" value="wp" disabled={pending} className={btnSecondary()}>
        نسخهٔ وردپرس جایگزین شود
      </button>
      {state && !state.ok ? <p role="alert" className="w-full text-sm text-danger">{state.message}</p> : null}
    </form>
  )
}

export function PurgeButton({ jobId }: { jobId: number }) {
  const { state, run, pending } = useImportAction(purgeNowAction)
  const [armed, setArmed] = useState(false)
  return (
    <form action={run} className="grid gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      {armed ? (
        <>
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-sm leading-7 text-muted">پس از حذف، برای انتقال دوباره باید فایل را از نو بارگذاری کنید.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={btnDanger()}>
              {pending ? '…' : 'بله، حذف شود'}
            </button>
            <button type="button" className={btnSecondary()} onClick={() => setArmed(false)}>
              انصراف
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={btnSecondary()} onClick={() => setArmed(true)}>
          حذف همین حالای دادهٔ خام
        </button>
      )}
      <Feedback state={state} />
    </form>
  )
}
