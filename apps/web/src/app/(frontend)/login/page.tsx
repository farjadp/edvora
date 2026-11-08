import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthFrame } from '../../../components/auth/AuthFrame'
import { StudentLoginForm } from '../../../components/auth/StudentLoginForm'
import { authBrand } from '../../../lib/authBrand'
import { getCurrentUser } from '../../../lib/session'
import { getCurrentTenant } from '../../../lib/tenant'

export const metadata: Metadata = { title: 'ورود' }

type Props = { searchParams: Promise<{ next?: string }> }

/** Student sign-in (E1, E-034 option B). Full page: PublicChrome leaves out the site header and footer here. */
export default async function LoginPage({ searchParams }: Props) {
  const raw = (await searchParams).next
  const fromProtected = Boolean(raw && raw.startsWith('/') && !raw.startsWith('//'))
  const next = fromProtected && raw ? raw : '/dashboard'
  if (await getCurrentUser()) redirect(next)
  const tenant = await getCurrentTenant()

  return (
    <AuthFrame brand={authBrand(tenant)} homeHref="/">
      <StudentLoginForm next={next} showSessionNotice={fromProtected} supportPhone={tenant.contact?.phone?.trim() || null} texts={tenant.loginTexts} />
    </AuthFrame>
  )
}
