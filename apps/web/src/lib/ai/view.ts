import 'server-only'
import type { PrivacyPolicy } from '@edvora/core/ai'
import { getPayloadClient } from '../payload'
import { aiSession } from './session'
import { loadAiConfig } from './settings'

/** One Persian line on what is hidden before anything is sent (shown under the chat input). */
export function privacyLine(p: PrivacyPolicy): string {
  const hidden = [!p.phones && 'تلفن', !p.emails && 'ایمیل', !p.nationalCodes && 'کد ملی', !p.names && 'نام'].filter(Boolean) as string[]
  const list = [...hidden, 'شمارهٔ کارت و شبا']
  return `${list.join('، ')} پیش از ارسال به ارائه‌دهنده پوشانده می‌شود.`
}

/** What the drawer needs on a page, or null when the person may not use the assistant here. Never throws. */
export type DrawerProps = { name: string; userName: string | null; privacyNote: string; enabled: boolean; sectionHref: string }

export async function drawerProps(): Promise<DrawerProps | null> {
  try {
    const auth = await aiSession()
    if (!auth.ok) return null
    const cfg = await loadAiConfig(await getPayloadClient(), auth.s.tenant.id)
    return { name: cfg.name, userName: auth.s.user.name ?? null, privacyNote: privacyLine(cfg.privacy), enabled: cfg.enabled, sectionHref: '/staff/assistant' }
  } catch (err) {
    console.error('[ai] drawer props failed', err)
    return null
  }
}
