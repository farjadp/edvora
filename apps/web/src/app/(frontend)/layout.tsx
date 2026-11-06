import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/900.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import './styles.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { NoticeBar } from '../../components/NoticeBar'
import { getCurrentTenant } from '../../lib/tenant'

export const dynamic = 'force-dynamic'

const HEX = /^#[0-9a-fA-F]{6}$/

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description: tenant.tagline ?? undefined,
  }
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const tenant = await getCurrentTenant()
  const brand = HEX.test(tenant.primaryColor ?? '') ? tenant.primaryColor : '#1A56DB'
  const accent = HEX.test(tenant.accentColor ?? '') ? tenant.accentColor : '#F59E0B'
  const defaultTheme = tenant.defaultTheme === 'dark' ? 'dark' : 'light'
  // Runs before paint so the saved theme never flashes.
  const themeScript = `try{var t=localStorage.getItem('theme')||'${defaultTheme}';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='${defaultTheme}'}`

  return (
    <html lang="fa" dir="rtl" data-theme={defaultTheme} suppressHydrationWarning>
      <head>
        <style>{`:root{--brand:${brand};--accent:${accent}}`}</style>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink">
        {tenant.notice?.enabled && tenant.notice.text ? <NoticeBar text={tenant.notice.text} /> : null}
        <Header tenant={tenant} />
        <main>{children}</main>
        <Footer tenant={tenant} />
      </body>
    </html>
  )
}
