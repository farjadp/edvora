import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Advisor } from '../../_components/advisor'
import { PreviewBar } from '../../_components/chrome'
import { Dashboard, DashboardOff } from '../../_components/dashboard'
import { Lesson } from '../../_components/lesson'
import { Quiz } from '../../_components/quiz'
import { OPTIONS, SCREENS, assertDev, isOption, isScreen, parseBrand } from '../../_lib/options'

type Props = {
  params: Promise<{ option: string; screen: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { option, screen } = await params
  const o = isOption(option) ? OPTIONS[option].nameEn : option
  const s = SCREENS.find((x) => x.id === screen)?.label ?? screen
  return { title: `E-027 · ${o} · ${s}`, robots: { index: false, follow: false } }
}

export default async function PreviewScreen({ params, searchParams }: Props) {
  assertDev()
  const { option, screen } = await params
  if (!isOption(option) || !isScreen(screen)) notFound()
  const sp = await searchParams
  const brand = parseBrand(sp.brand)
  const chrome = sp.chrome !== '0'

  return (
    <div data-e027-option={option} data-e027-brand={brand === 'tenant' ? undefined : brand} className="bg-[var(--e-ground)] text-ink">
      {chrome ? <PreviewBar option={option} screen={screen} brand={brand} /> : null}
      {screen === 'dashboard' ? <Dashboard option={option} /> : null}
      {screen === 'dashboard-off' ? <DashboardOff option={option} /> : null}
      {screen === 'lesson' ? <Lesson option={option} /> : null}
      {screen === 'quiz' ? <Quiz option={option} /> : null}
      {screen === 'advisor' ? <Advisor option={option} /> : null}
    </div>
  )
}
