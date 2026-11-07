import { guillocheAngles, rosettePoints, starPoints } from '@edvora/ui/seal'
import type { Tenant } from '../../payload-types'
import { authBrand } from '../../lib/authBrand'
import { getCurrentTenant } from '../../lib/tenant'
import { Logo as EdvoraLogo } from './Brand'
import { adminAccentCss } from './TenantAccent'

/*
 * /admin/login in the Seal card look (E-034 option B), through Payload's supported slots only: graphics.Logo,
 * beforeLogin, afterLogin, plus custom.scss scoped to `.login.template-minimal`. Payload's form, fields, toasts and auth
 * are untouched. The academy comes from the Host (same as /staff/login) and only public fields are read. Tailwind is not
 * loaded in the admin, so these use `ed-login-*` classes.
 */

/** Never let a tenant lookup break the admin sign-in: fall back to the Edvora wordmark. */
async function hostTenant(): Promise<Tenant | null> {
  try {
    return await getCurrentTenant()
  } catch {
    return null
  }
}

function SealSvg() {
  return (
    <svg className="ed-login-seal__art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <polygon points={rosettePoints(32, 32, 31)} className="ed-login-seal__teeth" />
      <circle cx="32" cy="32" r="23.5" fill="none" strokeWidth="0.9" className="ed-login-seal__ring" />
      <circle cx="32" cy="32" r="21" fill="none" strokeWidth="0.5" strokeDasharray="1.2 2" className="ed-login-seal__ring" />
    </svg>
  )
}

/** graphics.Logo on the login (and Payload's email-verify) page: the academy seal over the card edge, name and welcome line. */
export async function LoginLogo() {
  const tenant = await hostTenant()
  if (!tenant) return <EdvoraLogo />
  const b = authBrand(tenant)
  return (
    <span className="ed-login-brand">
      <span className="ed-login-seal">
        <SealSvg />
        {b.logoUrl ? (
          <span className="ed-login-seal__logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- tenant upload */}
            <img src={b.logoUrl} alt={b.logoAlt || b.name} />
          </span>
        ) : (
          <span className="ed-login-seal__initial" aria-hidden="true">
            {b.name.trim().slice(0, 1)}
          </span>
        )}
      </span>
      <span className="ed-login-brand__name">{b.name}</span>
      {b.welcome ? <span className="ed-login-brand__welcome">{b.welcome}</span> : null}
    </span>
  )
}

const Star = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <polygon points={starPoints(12, 12, 11)} fill="currentColor" />
  </svg>
)

/** beforeLogin: tenant accent colours, the page frame + guilloche watermark (decorative), star rule, tag and title. */
export async function BeforeLogin() {
  const tenant = await hostTenant()
  const name = tenant?.name ?? 'ادورا'
  return (
    <>
      <style>{adminAccentCss(tenant?.primaryColor)}</style>
      <div className="ed-login-frame" aria-hidden="true">
        <svg className="ed-login-frame__guilloche" viewBox="0 0 400 400" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth="0.55">
            {guillocheAngles(36).map((deg) => (
              <ellipse key={deg} cx="200" cy="200" rx="188" ry="64" transform={`rotate(${deg} 200 200)`} />
            ))}
            <circle cx="200" cy="200" r="196" />
            <circle cx="200" cy="200" r="190" strokeDasharray="1.5 3" />
            <circle cx="200" cy="200" r="70" />
            <circle cx="200" cy="200" r="46" />
            <polygon points={starPoints(200, 200, 40)} />
          </g>
        </svg>
        <Star className="ed-login-frame__star ed-login-frame__star--ts" />
        <Star className="ed-login-frame__star ed-login-frame__star--te" />
        <Star className="ed-login-frame__star ed-login-frame__star--bs" />
        <Star className="ed-login-frame__star ed-login-frame__star--be" />
      </div>
      <div className="ed-login-head">
        <div className="ed-login-rule" aria-hidden="true">
          <span />
          <Star className="ed-login-rule__star" />
          <span />
        </div>
        <p className="ed-login-tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="6" y="11" width="12" height="8" rx="1.5" />
            <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
          </svg>
          مدیریت
        </p>
        <h1 className="ed-login-title">ورود به بخش مدیریت {name}</h1>
      </div>
    </>
  )
}

/** afterLogin: the way to the staff door (2FA only works there, ADR 007) and honest forgot-password help (T13). */
export function AfterLogin() {
  return (
    <div className="ed-login-after">
      <p className="ed-login-after__line">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </svg>
        <span>
          کد دومرحله‌ای دارید؟ <a href="/staff/login">ورود کارکنان و تأیید دومرحله‌ای</a>
        </span>
      </p>
      <p className="ed-login-after__help">رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.</p>
    </div>
  )
}
