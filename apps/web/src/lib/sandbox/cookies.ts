import 'server-only'
import { openSecret, sealSecret, signSandboxSelector, verifySandboxSelector, type SandboxSelector } from '@edvora/core'
import { z } from 'zod'
import { env } from '../../env'

/**
 * Two cookies, both httpOnly + SameSite=Lax + host-only (never shared with academy domains):
 *  - `edvora_sbx`  — signed tenant selector {tid, exp}. Makes the platform host render that sandbox (ADR 013).
 *                    Set on creation and by the login address `/demo/s/<slug>` (second device).
 *  - `edvora_demo` — sealed (AES-GCM) creator cookie: the sandbox's generated passwords, so "ورود" and "ادامه" can
 *                    sign the visitor in without showing or storing the passwords (C1, C3). Only the creator's
 *                    browser holds it; the DB stores only password hashes.
 */
export const SELECTOR_COOKIE = 'edvora_sbx'
export const CREATOR_COOKIE = 'edvora_demo'

export const selectorSecret = () => `${env().SESSION_SECRET}:sandbox`
const creatorSecret = () => `${env().SESSION_SECRET}:sandbox-creator`

export const signSelector = (s: SandboxSelector) => signSandboxSelector(s, selectorSecret())
export const readSelector = (token: string | undefined, allowExpired = false) => verifySandboxSelector(token, selectorSecret(), Date.now(), allowExpired)

const Creds = z.object({ email: z.string().max(200), password: z.string().max(200) })
const CreatorSchema = z.object({
  v: z.literal(1),
  /** demo-sandboxes id */
  sid: z.number().int().positive(),
  tid: z.number().int().positive(),
  slug: z.string().max(40),
  exp: z.number(),
  /** Random key; its hash is on the sandbox record, so a cookie from another sandbox cannot be replayed. */
  key: z.string().max(64),
  admin: Creds,
  student: Creds,
})
export type CreatorCookie = z.infer<typeof CreatorSchema>

export const sealCreator = (c: Omit<CreatorCookie, 'v'>) => sealSecret(JSON.stringify({ v: 1, ...c }), creatorSecret())

export function openCreator(token: string | undefined): CreatorCookie | null {
  if (!token || token.length > 4096) return null
  const raw = openSecret(token, creatorSecret())
  if (!raw) return null
  try {
    const parsed = CreatorSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Cookies live until the end of the grace period, so the visitor sees "ended" rather than a blank form. */
export function cookieOptions(maxAgeS: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: Math.max(60, Math.floor(maxAgeS)) }
}
