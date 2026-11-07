/**
 * /admin language default (E-035). Payload picks the UI language from the `payload-lng` cookie, then the browser's
 * Accept-Language, then `i18n.fallbackLanguage`. Edvora's operators work in Persian, so an English browser must not
 * flip /admin to English/LTR: when the cookie is missing (or holds an unsupported value) the proxy sets it to `fa`
 * on the request AND the response. A cookie the person set themselves (Account → Language) is never touched.
 * Pure: no Next or Payload imports, unit-tested.
 */
export const ADMIN_LANG_COOKIE = 'payload-lng'
export const ADMIN_DEFAULT_LANG = 'fa'
export const ADMIN_LANGS = ['fa', 'en'] as const

/** The language already chosen in a Cookie header, if it is one we support. */
export function chosenAdminLanguage(cookieHeader: string | null | undefined): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0 || part.slice(0, i).trim() !== ADMIN_LANG_COOKIE) continue
    const v = decodeURIComponent(part.slice(i + 1).trim())
    return (ADMIN_LANGS as readonly string[]).includes(v) ? v : null
  }
  return null
}

/** The Cookie header to forward: unchanged when a language is chosen, else with `payload-lng=fa` (old value replaced). */
export function withDefaultAdminLanguage(cookieHeader: string | null | undefined): { cookie: string; changed: boolean } {
  const current = cookieHeader ?? ''
  if (chosenAdminLanguage(current)) return { cookie: current, changed: false }
  const rest = current
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p && p.slice(0, p.indexOf('=')).trim() !== ADMIN_LANG_COOKIE)
  return { cookie: [...rest, `${ADMIN_LANG_COOKIE}=${ADMIN_DEFAULT_LANG}`].join('; '), changed: true }
}
