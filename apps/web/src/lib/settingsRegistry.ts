import { BUILT_IN_SECTIONS, SECTION_PERMISSION, canOpenSettings, type BuiltInSection, type SettingsGroup, type SettingsScope, type SettingsViewer } from '@edvora/core/settings'
import type { ConsoleIconName } from '@edvora/ui/console'

/**
 * The settings hub's section registry (E-047, ADR 019 §4). A section either has a form inside the hub (`key` is a
 * built-in section, no `href`) or links to its module's own screen (`href`). To add a module's settings:
 *
 *   registerSettingsSection({ key: 'my-module', label: '…', help: '…', group: 'modules', scope: 'academy',
 *     permission: 'my-module.manage', icon: 'settings', href: '/admin/collections/my-module-settings',
 *     requiresCollection: 'my-module-settings' })
 *
 * `permission: null` = platform admins only. `requiresCollection` hides the entry until the module is installed.
 * Visibility here is cosmetic; the module's own access rules still decide every read and write.
 */
export type SettingsSectionDef = {
  key: string
  label: string
  help: string
  group: SettingsGroup
  scope: SettingsScope
  /** Permission in the academy being edited; null = platform admins only. */
  permission: string | null
  icon: ConsoleIconName
  /** A link section (the module's own screen). Without it, the hub renders the built-in form for `key`. */
  href?: string
  /** Show only when this Payload collection exists (a module that may not have landed yet). */
  requiresCollection?: string
}

const BUILT_IN: Record<BuiltInSection, Omit<SettingsSectionDef, 'key' | 'permission'>> = {
  identity: { label: 'هویت آکادمی', help: 'نام، شعار، لوگوها، نماد زبانه و تصویر اشتراک‌گذاری', group: 'academy', scope: 'academy', icon: 'building' },
  appearance: { label: 'ظاهر و رنگ‌ها', help: 'رنگ اصلی و تأکیدی با پیش‌نمایش، پوستهٔ پیش‌فرض، قلم', group: 'academy', scope: 'academy', icon: 'sun' },
  contact: { label: 'تماس و شبکه‌های اجتماعی', help: 'تلفن، ایمیل، نشانی و پیوندهای اجتماعی', group: 'academy', scope: 'academy', icon: 'phone' },
  seo: { label: 'سئو', help: 'عنوان و توضیح پیش‌فرض صفحه‌ها برای موتورهای جست‌وجو', group: 'site', scope: 'academy', icon: 'search' },
  homepage: { label: 'بلوک‌های صفحهٔ اصلی', help: 'نوار اطلاع‌رسانی، خدمات، آمار و برندهای همراه', group: 'site', scope: 'academy', icon: 'site' },
  login: { label: 'صفحهٔ ورود', help: 'عنوان و متن‌های راهنمای صفحهٔ ورود دانشجویان', group: 'site', scope: 'academy', icon: 'lock' },
  legal: { label: 'صفحه‌های حقوقی', help: 'قوانین، حریم خصوصی و بازپرداخت', group: 'site', scope: 'academy', icon: 'post' },
  features: { label: 'بخش‌ها و انگیزش', help: 'روشن و خاموش کردن بخش‌های سایت و گیمیفیکیشن', group: 'site', scope: 'academy', icon: 'bolt' },
  certificates: { label: 'گواهی‌ها', help: 'پیشوند کد گواهی، نام و سمت امضاکننده، تصویر امضا', group: 'academy', scope: 'academy', icon: 'certificate' },
  notifications: { label: 'قالب پیامک و ایمیل', help: 'متن پیام هر رویداد با متغیرها', group: 'messages', scope: 'academy', icon: 'bell' },
  integrations: { label: 'سرویس‌ها و کلیدهای API', help: 'پیامک، ایمیل و کلاس زنده با آزمون اتصال', group: 'integrations', scope: 'academy', icon: 'bolt' },
  'platform-providers': { label: 'سرویس‌ها و امنیت پلتفرم', help: 'سرویس‌های پیش‌فرض، اجازهٔ سرویس اختصاصی، سیاست تأیید دومرحله‌ای', group: 'platform', scope: 'platform', icon: 'shield' },
  'platform-academies': { label: 'آکادمی‌ها، دامنه‌ها و طرح‌ها', help: 'دامنه‌ها، طرح، سقف‌ها و ماژول‌های هر آکادمی', group: 'platform', scope: 'platform', icon: 'building' },
}

const registry: SettingsSectionDef[] = BUILT_IN_SECTIONS.map((key) => ({ key, permission: SECTION_PERMISSION[key], ...BUILT_IN[key] }))

/** Add (or replace, by key) a section. Modules call this once at import time. */
export function registerSettingsSection(def: SettingsSectionDef): void {
  const i = registry.findIndex((s) => s.key === def.key)
  if (i >= 0) registry[i] = def
  else registry.push(def)
}

// ---- Link sections: modules that keep their own settings screens.

// E-045 payment methods (ADR 017): its own per-academy screen. Appears once the collection exists.
registerSettingsSection({
  key: 'payments',
  label: 'روش‌های پرداخت',
  help: 'درگاه‌ها، کارت‌به‌کارت و تتر — در صفحهٔ ماژول پرداخت',
  group: 'modules',
  scope: 'academy',
  permission: 'payments.settings',
  icon: 'card',
  href: '/admin/collections/payment-methods',
  requiresCollection: 'payment-methods',
})
// E-046 AI assistant (ADR 018): its own per-academy screen. Appears once the collection exists.
registerSettingsSection({
  key: 'ai',
  label: 'دستیار هوش مصنوعی',
  help: 'سرویس، کلید، حریم خصوصی و پایگاه دانش — در صفحهٔ ماژول دستیار',
  group: 'modules',
  scope: 'academy',
  permission: 'ai.manage',
  icon: 'star',
  href: '/staff/assistant/settings',
  requiresCollection: 'ai-settings',
})
registerSettingsSection({ key: 'roles', label: 'نقش‌ها', help: 'نقش‌ها، دسترسی‌ها و تنظیمات هر نقش', group: 'people', scope: 'academy', permission: 'roles.view', icon: 'roles', href: '/admin/collections/roles' })
registerSettingsSection({ key: 'memberships', label: 'عضویت‌ها', help: 'چه کسی در این آکادمی چه نقشی دارد', group: 'people', scope: 'academy', permission: 'roles.assign', icon: 'membership', href: '/admin/collections/memberships' })
registerSettingsSection({ key: 'audit', label: 'گزارش ممیزی', help: 'چه کسی چه چیزی را تغییر داد', group: 'people', scope: 'academy', permission: 'audit.view', icon: 'audit', href: '/admin/collections/audit-logs' })
registerSettingsSection({ key: 'import', label: 'انتقال از وردپرس', help: 'وارد کردن دوره‌ها و محتوا از سایت قبلی', group: 'modules', scope: 'academy', permission: 'import.view', icon: 'download', href: '/staff/import' })

export function settingsSections(): readonly SettingsSectionDef[] {
  return registry
}

/**
 * Sections this person may open. `academyPerms` are their permissions in the academy being edited.
 * `hasCollection` answers whether a module's collection is installed.
 */
export function visibleSections(who: SettingsViewer, hasCollection: (slug: string) => boolean): SettingsSectionDef[] {
  return registry.filter((s) => (!s.requiresCollection || hasCollection(s.requiresCollection)) && canOpenSettings(who, s.permission))
}

export const sectionByKey = (key: string): SettingsSectionDef | undefined => registry.find((s) => s.key === key)

/** Every permission that opens at least one hub section (the nav entry's read rule). */
export function hubPermissions(): string[] {
  return [...new Set(registry.map((s) => s.permission).filter((p): p is string => Boolean(p)))]
}
