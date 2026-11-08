/**
 * Role settings (E-039, ADR 016): per-role security rules and per-role experience (landing page, menu sections,
 * dashboard widgets). Pure and client-safe (no Node modules): import from '@edvora/core/role-settings' in client code.
 *
 * Security rules are enforced on the grants (a role whose rule fails grants nothing in that session). Experience
 * settings only ever hide things; access is still decided by permissions.
 */
import type { DeskKey } from './staff'

// ---------------------------------------------------------------- Catalogues

/** Where a person lands after signing in to /staff. `auto` = the desk priority (ADR 008). */
export const LANDING_OPTIONS = [
  { value: 'auto', fa: 'خودکار (بر اساس دسترسی‌ها)', en: 'Automatic (by permissions)' },
  { value: 'overview', fa: 'نمای کلی', en: 'Overview desk' },
  { value: 'leads', fa: 'مشتریان بالقوه', en: 'Leads desk' },
  { value: 'finance', fa: 'مالی', en: 'Finance desk' },
  { value: 'students', fa: 'دانشجویان', en: 'Students desk' },
  { value: 'teaching', fa: 'آموزش', en: 'Teaching desk' },
  { value: 'support', fa: 'پشتیبانی', en: 'Support desk' },
  { value: 'content', fa: 'محتوا', en: 'Content desk' },
  { value: 'admin', fa: 'پنل تنظیمات (/admin)', en: 'Setup panel (/admin)' },
] as const

export type LandingKey = (typeof LANDING_OPTIONS)[number]['value']
/** Desk keys a landing can point at (kept equal to STAFF_DESKS keys by a test). */
export const LANDING_DESKS: readonly DeskKey[] = ['overview', 'leads', 'finance', 'students', 'teaching', 'support', 'content']

/** Console menu groups (kept equal to the web app's CONSOLE_GROUPS keys by a test there). */
export const MENU_SECTIONS = [
  { value: 'dashboard', fa: 'داشبورد', en: 'Dashboard' },
  { value: 'crm', fa: 'مشتریان', en: 'Customers' },
  { value: 'sales', fa: 'فروش', en: 'Sales' },
  { value: 'learning', fa: 'آموزش', en: 'Learning' },
  { value: 'students', fa: 'دانشجویان', en: 'Students' },
  { value: 'content', fa: 'محتوا', en: 'Content' },
  { value: 'settings', fa: 'تنظیمات', en: 'Settings' },
] as const
export type MenuSectionKey = (typeof MENU_SECTIONS)[number]['value']

/** Blocks of the overview desk and the /admin dashboard. */
export const DASHBOARD_WIDGETS = [
  { value: 'kpis', fa: 'کارت‌های آمار', en: 'KPI cards' },
  { value: 'alerts', fa: 'هشدارها', en: 'Alerts' },
  { value: 'activity', fa: 'رویدادهای اخیر', en: 'Recent activity' },
  { value: 'donut', fa: 'ثبت‌نام به تفکیک دوره', en: 'Enrolments by course' },
  { value: 'bars', fa: 'نمودار هفتگی', en: 'Weekly bars' },
  { value: 'quick', fa: 'میان‌برها', en: 'Quick actions' },
  { value: 'summary', fa: 'خلاصهٔ سفارش‌ها', en: 'Orders summary' },
] as const
export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]['value']

const LANDING_SET: ReadonlySet<string> = new Set(LANDING_OPTIONS.map((o) => o.value))
const MENU_SET: ReadonlySet<string> = new Set(MENU_SECTIONS.map((o) => o.value))
const WIDGET_SET: ReadonlySet<string> = new Set(DASHBOARD_WIDGETS.map((o) => o.value))

export const MAX_SESSION_HOURS = 720

// ---------------------------------------------------------------- Security

export type RolePolicy = {
  require2fa?: boolean | null
  /** Hours since the Payload session was created. Empty = no limit (the token's own expiry still applies). */
  maxSessionHours?: number | null
  /** Tehran wall-clock hours, `[from, to)`. `from > to` wraps midnight. */
  loginHours?: { enabled?: boolean | null; from?: number | null; to?: number | null } | null
}

export type SessionFacts = {
  /** This session passed its TOTP check (ADR 007). */
  secondFactorVerified: boolean
  /** `createdAt` of the Payload session (`sid`); null = unknown, which fails closed when a limit is set. */
  sessionStartedAt: Date | string | null
  now: Date
}

export type WithheldReason = 'needs-2fa' | 'session-too-old' | 'outside-hours'
/** Order in which a person is told about withheld roles (fix 2FA first; hours last). */
export const WITHHELD_ORDER: readonly WithheldReason[] = ['needs-2fa', 'session-too-old', 'outside-hours']

const isHour = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23

/** Does the role carry any security rule (so the session facts must be read)? */
export function hasPolicy(p: RolePolicy | null | undefined): boolean {
  if (!p) return false
  return Boolean(p.require2fa) || (typeof p.maxSessionHours === 'number' && p.maxSessionHours > 0) || Boolean(p.loginHours?.enabled)
}

/** Iran has had no daylight-saving time since 2022: Tehran = UTC+03:30 all year. */
const TEHRAN_OFFSET_MIN = 210

export function tehranHour(now: Date): number {
  const minutes = Math.floor(now.getTime() / 60_000) + TEHRAN_OFFSET_MIN
  return Math.floor((((minutes % 1440) + 1440) % 1440) / 60)
}

/** `[from, to)` in whole hours; `from > to` wraps midnight. Invalid input = never inside (fail closed). */
export function inLoginHours(from: unknown, to: unknown, hour: number): boolean {
  if (!isHour(from) || !isHour(to) || from === to) return false
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

/** Why this role grants nothing in this session, or null when its rules hold. */
export function rolePolicyBlock(p: RolePolicy | null | undefined, s: SessionFacts): WithheldReason | null {
  if (!hasPolicy(p) || !p) return null
  if (p.require2fa && !s.secondFactorVerified) return 'needs-2fa'
  if (typeof p.maxSessionHours === 'number' && p.maxSessionHours > 0) {
    const started = s.sessionStartedAt ? new Date(s.sessionStartedAt).getTime() : NaN
    if (!Number.isFinite(started)) return 'session-too-old'
    if (s.now.getTime() - started > p.maxSessionHours * 3_600_000) return 'session-too-old'
  }
  if (p.loginHours?.enabled && !inLoginHours(p.loginHours.from, p.loginHours.to, tehranHour(s.now))) return 'outside-hours'
  return null
}

/** The first reason (by WITHHELD_ORDER) present in a list, or null. */
export function firstWithheld(reasons: readonly WithheldReason[]): WithheldReason | null {
  return WITHHELD_ORDER.find((r) => reasons.includes(r)) ?? null
}

// ---------------------------------------------------------------- Experience

export type RoleExperience = {
  landing?: string | null
  menuSections?: readonly string[] | null
  dashboardWidgets?: readonly string[] | null
}

export type MergedExperience = {
  /** Non-`auto` landings in role order (the caller picks the first one the person can open). */
  landings: LandingKey[]
  menuSections: 'all' | MenuSectionKey[]
  dashboardWidgets: 'all' | DashboardWidgetKey[]
}

export const ALL_EXPERIENCE: MergedExperience = { landings: [], menuSections: 'all', dashboardWidgets: 'all' }

/**
 * Merges the experience settings of a person's active roles in one academy. Menus and widgets are a union; a role
 * that leaves a list empty means "all" for that list (a role never hides what another role of the person shows).
 * No roles at all = everything (platform admins, or nothing to hide because permissions already hide it).
 */
export function mergeExperience(list: readonly RoleExperience[]): MergedExperience {
  if (list.length === 0) return ALL_EXPERIENCE
  const landings: LandingKey[] = []
  let menus: Set<MenuSectionKey> | 'all' = new Set()
  let widgets: Set<DashboardWidgetKey> | 'all' = new Set()
  for (const e of list) {
    const l = e.landing
    if (typeof l === 'string' && l !== 'auto' && LANDING_SET.has(l) && !landings.includes(l as LandingKey)) landings.push(l as LandingKey)
    const ms = (e.menuSections ?? []).filter((v) => MENU_SET.has(v)) as MenuSectionKey[]
    if (ms.length === 0) menus = 'all'
    else if (menus !== 'all') for (const v of ms) menus.add(v)
    const ws = (e.dashboardWidgets ?? []).filter((v) => WIDGET_SET.has(v)) as DashboardWidgetKey[]
    if (ws.length === 0) widgets = 'all'
    else if (widgets !== 'all') for (const v of ws) widgets.add(v)
  }
  const order = <T extends string>(set: Set<T>, cat: readonly { value: string }[]) => cat.map((o) => o.value as T).filter((v) => set.has(v))
  return {
    landings,
    menuSections: menus === 'all' ? 'all' : order(menus, MENU_SECTIONS),
    dashboardWidgets: widgets === 'all' ? 'all' : order(widgets, DASHBOARD_WIDGETS),
  }
}

export const sectionShown = (e: MergedExperience | null | undefined, key: string): boolean =>
  !e || e.menuSections === 'all' || (e.menuSections as readonly string[]).includes(key)

export const widgetShown = (e: MergedExperience | null | undefined, key: string): boolean =>
  !e || e.dashboardWidgets === 'all' || (e.dashboardWidgets as readonly string[]).includes(key)

// ---------------------------------------------------------------- Validation (collection hook)

export type RoleSettingsInput = { security?: RolePolicy | null; experience?: RoleExperience | null }

/** Server-side validation of a role's settings. Returns a Persian reason for the editor. */
export function validateRoleSettings(input: RoleSettingsInput): { ok: true } | { ok: false; reason: string } {
  const s = input.security
  if (s?.maxSessionHours != null) {
    const h = s.maxSessionHours
    if (!Number.isInteger(h) || h < 1 || h > MAX_SESSION_HOURS) return { ok: false, reason: `حداکثر مدت نشست باید عددی صحیح بین ۱ تا ${MAX_SESSION_HOURS} ساعت باشد.` }
  }
  if (s?.loginHours?.enabled) {
    const { from, to } = s.loginHours
    if (!isHour(from) || !isHour(to)) return { ok: false, reason: 'ساعت شروع و پایان ورود باید بین ۰ تا ۲۳ باشد.' }
    if (from === to) return { ok: false, reason: 'ساعت شروع و پایان ورود نمی‌تواند یکی باشد.' }
  }
  const e = input.experience
  if (e?.landing != null && !LANDING_SET.has(e.landing)) return { ok: false, reason: 'صفحهٔ شروع انتخاب‌شده معتبر نیست.' }
  if ((e?.menuSections ?? []).some((v) => !MENU_SET.has(v))) return { ok: false, reason: 'بخش منوی انتخاب‌شده معتبر نیست.' }
  if ((e?.dashboardWidgets ?? []).some((v) => !WIDGET_SET.has(v))) return { ok: false, reason: 'ویجت داشبورد انتخاب‌شده معتبر نیست.' }
  return { ok: true }
}
