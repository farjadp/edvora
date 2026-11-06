'use client'

import type { ReactNode } from 'react'
import { BareAuthLayout } from '../../../../components/staff/BareAuthLayout'
import { DeskPlaceholder } from '../../../../components/staff/DeskPlaceholder'
import { ForbiddenPage } from '../../../../components/staff/ForbiddenPage'
import { SecurityPromoCard } from '../../../../components/staff/SecurityPromoCard'
import { StaffLoginForm } from '../../../../components/staff/StaffLoginForm'
import { StaffShell } from '../../../../components/staff/StaffShell'
import { StartPage } from '../../../../components/staff/StartPage'
import { TwoFactorEnrolForm } from '../../../../components/staff/TwoFactorEnrolForm'
import { TwoFactorLockout } from '../../../../components/staff/TwoFactorLockout'
import { TwoFactorStatusCard } from '../../../../components/staff/TwoFactorStatusCard'
import { TwoFactorVerifyForm } from '../../../../components/staff/TwoFactorVerifyForm'
import type { StaffNavItem } from '../../../../components/staff/types'
import type { TwoFactorResult, TwoFactorSetupData } from '../../../../components/staff/twoFactorClient'

const items: StaffNavItem[] = [
  { key: 'overview', label: 'نمای کلی', href: '/staff/overview', icon: 'overview' },
  { key: 'leads', label: 'مشتریان', href: '/staff/leads', icon: 'leads' },
  { key: 'finance', label: 'مالی', href: '/staff/finance', icon: 'finance' },
  { key: 'students', label: 'دانشجویان', href: '/staff/students', icon: 'students' },
  { key: 'teaching', label: 'آموزش', href: '/staff/teaching', icon: 'teaching' },
  { key: 'support', label: 'پشتیبانی', href: '/staff/support', icon: 'support' },
  { key: 'content', label: 'محتوا', href: '/staff/content', icon: 'content' },
]
const secondary: StaffNavItem[] = [
  { key: 'settings', label: 'تنظیمات و راه‌اندازی', href: '/admin', icon: 'settings', external: true },
  { key: 'security', label: 'امنیت حساب', href: '/staff/security', icon: 'security' },
]

const user = { name: 'علی رضایی', email: 'ali.rezaei@example.com', roles: ['مدیر آکادمی', 'مشاور'] }

// 21x21 fake QR-ish pattern, only for layout.
const cells = Array.from({ length: 21 * 21 }, (_, i) => ((i * 7 + Math.floor(i / 21) * 3) % 5 < 2 ? 1 : 0))
const qrSvg = `<svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${cells
  .map((c, i) => (c ? `<rect x="${i % 21}" y="${Math.floor(i / 21)}" width="1" height="1" fill="#000"/>` : ''))
  .join('')}</svg>`
const setupData: TwoFactorSetupData = { secret: 'JBSWY3DPEHPK3PXPABCDEFGH', otpauthUri: 'otpauth://totp/Edvora:ali?secret=JBSWY3DPEHPK3PXP', qrSvg }

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 600))
const wrong = () => wait<TwoFactorResult>({ kind: 'wrong', attemptsLeft: 3 })
const okCode = (code: string) => wait<TwoFactorResult>(code === '123456' ? { kind: 'ok', data: undefined } : { kind: 'wrong' })
const setupOk = () => wait<TwoFactorResult<TwoFactorSetupData>>({ kind: 'ok', data: setupData })

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t-4 border-ink pt-4">
      <h2 className="font-latin text-sm font-bold text-muted">{title}</h2>
      {children}
    </section>
  )
}

export function PreviewClient() {
  const shellProps = { tenantName: 'آکادمی برند ایران', host: 'iba.localhost', user, items, secondaryItems: secondary, logoutHref: '/staff/logout', currentPath: '/staff/leads' }
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-8">
      <Section title="StaffShell + DeskPlaceholder (contained)">
        <div className="relative isolate h-[640px] overflow-auto rounded-2xl border border-line [transform:translateZ(0)]">
          <StaffShell {...shellProps}>
            <div className="grid gap-5">
              <SecurityPromoCard userId="preview" />
              <DeskPlaceholder title="مشتریان بالقوه" description="صف کار روزانهٔ مشاوران، تماس‌ها و پیگیری‌ها اینجا نمایش داده می‌شود." adminLink={{ label: 'رفتن به فهرست مشتریان بالقوه', href: '/admin/collections/leads' }} />
            </div>
          </StaffShell>
        </div>
      </Section>

      <Section title="StartPage">
        <StartPage items={[...items.slice(1, 4), ...secondary]} />
        <StartPage items={[secondary[1]!]} />
      </Section>

      <Section title="ForbiddenPage A / B / C">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          <ForbiddenPage variant="A" logoutHref="/staff/logout" />
          <ForbiddenPage variant="B" logoutHref="/staff/logout" />
          <ForbiddenPage variant="C" logoutHref="/staff/logout" permissionCode="leads.view" />
        </div>
      </Section>

      <Section title="Login">
        <BareAuthLayout tenantName="آکادمی برند ایران" title="ورود کارکنان">
          <StaffLoginForm next="/staff" initialError="invalid" onSubmit={() => wait({ ok: false as const, error: 'locked' as const })} />
        </BareAuthLayout>
      </Section>

      <Section title="Verify (code 123456 = ok, others wrong)">
        <BareAuthLayout tenantName="آکادمی برند ایران" title="تأیید دومرحله‌ای">
          <TwoFactorVerifyForm email={user.email} next="/staff" logoutHref="/staff/logout" onSubmit={okCode} />
        </BareAuthLayout>
      </Section>

      <Section title="Verify locked">
        <BareAuthLayout tenantName="آکادمی برند ایران" title="تأیید دومرحله‌ای">
          <TwoFactorVerifyForm email={user.email} next="/staff" logoutHref="/staff/logout" initialLockedUntil={Date.now() + 14 * 60_000 + 59_000} onSubmit={wrong} />
        </BareAuthLayout>
      </Section>

      <Section title="Enrol forced (setup preloaded)">
        <BareAuthLayout tenantName="آکادمی برند ایران" title="فعال‌سازی تأیید دومرحله‌ای">
          <TwoFactorEnrolForm mode="forced" next="/staff" logoutHref="/staff/logout" initialSetup={setupData} onEnable={wrong} />
        </BareAuthLayout>
      </Section>

      <Section title="Security page: off / on / required">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
          <TwoFactorStatusCard enabled={false} required={false} enrol={{ next: '/staff', onSetup: setupOk, onEnable: okCode }} />
          <TwoFactorStatusCard enabled required={false} enrol={{ next: '/staff' }} onDisable={okCode} />
          <TwoFactorStatusCard enabled required enrol={{ next: '/staff' }} />
          <TwoFactorLockout lockedUntil={Date.now() + 90_000} />
        </div>
      </Section>
    </div>
  )
}
