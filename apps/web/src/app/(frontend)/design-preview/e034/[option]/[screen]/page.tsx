import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PreviewBar } from '../../_components/chrome'
import { getScreen } from '../../_components/screens'
import { Shell } from '../../_components/shells'
import { DEMO_TENANT, SCREENS } from '../../_lib/data'
import { OPTIONS, assertDev, isOption, parseBrand, type BrandId } from '../../_lib/options'

type Props = {
  params: Promise<{ option: string; screen: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { option, screen } = await params
  const o = isOption(option) ? OPTIONS[option].nameEn : option
  const s = SCREENS.find((x) => x.id === screen)?.label ?? screen
  return { title: `E-034 · ${o} · ${s}`, robots: { index: false, follow: false } }
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * ?brand=teal|wine|blue  palette override · ?chrome=0 hides the switcher · ?live=0 freezes timers (screenshots)
 * ?name=…  academy name (tests long names) · ?welcome=default  uses the «خوش آمدید به {name}» fallback
 */
export default async function PreviewScreen({ params, searchParams }: Props) {
  assertDev()
  const { option, screen } = await params
  if (!isOption(option)) notFound()
  const sp = await searchParams
  const brand = parseBrand(sp.brand)
  const chrome = sp.chrome !== '0'
  const live = sp.live !== '0'
  const name = first(sp.name)?.slice(0, 80) || DEMO_TENANT.name
  const tenant = { ...DEMO_TENANT, name, welcome: first(sp.welcome) === 'default' ? `خوش آمدید به ${name}` : DEMO_TENANT.welcome }

  const qs = (b: BrandId = brand) => {
    const p = new URLSearchParams()
    if (b !== 'tenant') p.set('brand', b)
    if (!chrome) p.set('chrome', '0')
    if (!live) p.set('live', '0')
    if (first(sp.name)) p.set('name', first(sp.name)!)
    if (first(sp.welcome)) p.set('welcome', first(sp.welcome)!)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  const content = getScreen(screen, { o: option, tenant, live, qs: qs() })
  if (!content) notFound()

  return (
    <div data-e034 data-e034-brand={brand === 'tenant' ? undefined : brand} className="bg-bg text-ink">
      <Shell o={option} tenant={tenant} content={content} />
      {chrome ? <PreviewBar option={option} screen={screen} brand={brand} qs={qs} /> : null}
    </div>
  )
}
