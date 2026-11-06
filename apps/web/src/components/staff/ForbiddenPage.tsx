import { toPersianDigits } from '@edvora/core/digits'
import type { ReactNode } from 'react'
import { btnPrimary, btnSecondary, PostButton } from './ui'

/** A · not a member / inactive · B · student account · C · lacks this desk's permission (shown inside the shell). */
export type ForbiddenVariant = 'A' | 'B' | 'C'

export type ForbiddenPageProps = {
  variant: ForbiddenVariant
  /** POST route handler that ends the session. */
  logoutHref: string
  /** C: the user's landing desk. */
  landingHref?: string
  /** A: public site. Default `/`. */
  siteHref?: string
  /** B: student panel. Default `/dashboard`. */
  dashboardHref?: string
  /** C: missing permission key, Latin, e.g. `leads.view`. */
  permissionCode?: string
}

const copy: Record<ForbiddenVariant, { title: string; body: string }> = {
  A: {
    title: 'شما در این آکادمی دسترسی کارکنان ندارید',
    body: 'دسترسی شما به این آکادمی وجود ندارد یا غیرفعال شده است. اگر در آکادمی دیگری کار می‌کنید، از نشانی همان آکادمی وارد شوید.',
  },
  B: {
    title: 'این بخش مخصوص کارکنان آکادمی است',
    body: 'با حساب دانشجویی وارد شده‌اید. میز کارکنان برای دانشجویان باز نیست.',
  },
  C: {
    title: 'به این بخش دسترسی ندارید',
    body: 'حساب شما اجازهٔ دیدن این صفحه را ندارد. اگر فکر می‌کنید اشتباه شده، از مدیر آکادمی بخواهید دسترسی شما را بررسی کند.',
  },
}

/** Presentational 403. The route must also answer with HTTP 403 and noindex. */
export function ForbiddenPage({ variant, logoutHref, landingHref = '/staff', siteHref = '/', dashboardHref = '/dashboard', permissionCode }: ForbiddenPageProps) {
  const { title, body } = copy[variant]
  let actions: ReactNode
  if (variant === 'A') {
    actions = (
      <>
        <PostButton action={logoutHref} primary>خروج از حساب</PostButton>
        <a href={siteHref} className={btnSecondary(true)}>بازگشت به سایت</a>
      </>
    )
  } else if (variant === 'B') {
    actions = (
      <>
        <a href={dashboardHref} className={btnPrimary(true)}>رفتن به پنل دانشجو</a>
        <PostButton action={logoutHref}>خروج از حساب</PostButton>
      </>
    )
  } else {
    actions = (
      <>
        <a href={landingHref} className={btnPrimary(true)}>بازگشت به میز کار من</a>
        <PostButton action={logoutHref}>خروج از حساب</PostButton>
      </>
    )
  }
  return (
    <section className="mx-auto grid w-full max-w-md justify-items-center gap-5 py-10 text-center">
      <p className="text-7xl font-black leading-none text-brand" aria-hidden>
        {toPersianDigits(403)}
      </p>
      <h1 className="text-2xl font-black leading-snug">{title}</h1>
      <p className="leading-8 text-muted">{body}</p>
      {variant === 'C' && permissionCode ? (
        <p className="text-sm text-muted">
          کد دسترسی: <span dir="ltr" className="inline-block font-latin">{permissionCode}</span>
        </p>
      ) : null}
      <div className="mt-2 grid w-full gap-3 sm:grid-cols-1">{actions}</div>
    </section>
  )
}
