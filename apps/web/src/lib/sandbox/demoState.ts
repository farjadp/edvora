import 'server-only'
import { formatJalali, formatRemainingFa, issueChallenge, remainingMs, sandboxState, toLatinDigits, type PowChallenge } from '@edvora/core'
import { z } from 'zod'
import { env } from '../../env'

export const powSecret = () => `${env().SESSION_SECRET}:pow`
export const newChallenge = (bits: number): PowChallenge => issueChallenge(powSecret(), bits)

/** Persian copy helpers shared by the page and the API. Server clock decides; strings are display only. */
export const timeFa = (iso: string | Date) => formatJalali(iso, 'HH:mm')
export const remainingFa = (iso: string | null | undefined) => formatRemainingFa(remainingMs(iso))
export const isActive = (t: { isSandbox?: boolean | null; expiresAt?: string | null }) => sandboxState(t) === 'active'

/** Persian/Arabic digits → Latin, trim, collapse spaces (V6). */
const clean = (v: unknown) => (typeof v === 'string' ? toLatinDigits(v).replace(/\s+/g, ' ').trim() : v)

export const VisitorInput = z.object({
  name: z.preprocess(clean, z.string().max(80).optional()).transform((v) => v || undefined),
  email: z.preprocess(
    (v) => {
      const c = clean(v)
      return typeof c === 'string' ? c.replace(/\s/g, '').toLowerCase() || undefined : c
    },
    z.email({ message: 'bad-email' }).max(200).optional(),
  ),
  consent: z.boolean().optional().default(false),
  /** Honeypot: hidden from people, filled by bots (A1). */
  website: z.string().max(200).optional().default(''),
})

export const CreateInput = VisitorInput.extend({
  token: z.string().min(10).max(1000),
  counter: z.number().int().nonnegative(),
})

export const ConsentLine = 'فقط برای تماس دربارهٔ ادورا'
