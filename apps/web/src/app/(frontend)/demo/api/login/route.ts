import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { allowRequest, demoRequest } from '../../../../../lib/sandbox/guard'
import { signInSandboxAccount } from '../../../../../lib/sandbox/signin'
import { getSelectedSandbox } from '../../../../../lib/tenant'
import { toLatinDigits } from '@edvora/core'

export const dynamic = 'force-dynamic'

const Input = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) })

/**
 * POST /demo/api/login (form) — username + password for a sandbox account, on the sandbox selected by the
 * `edvora_sbx` cookie (set by the login address /demo/s/<slug>). Answers 303 (ADR 005), never a redirect().
 */
export async function POST(request: Request) {
  const origin = await getRequestOrigin()
  const back = (error: string) => NextResponse.redirect(new URL(`/demo/login?error=${error}`, origin), 303)
  const r = await demoRequest()
  if (!r) return NextResponse.redirect(new URL('/', origin), 303)
  if (!allowRequest(r)) return back('rate')
  const form = await request.formData().catch(() => null)
  const parsed = Input.safeParse({ email: toLatinDigits(String(form?.get('email') ?? '')), password: toLatinDigits(String(form?.get('password') ?? '')) })
  if (!parsed.success) return back('invalid')
  const tenant = await getSelectedSandbox()
  if (!tenant) return NextResponse.redirect(new URL('/demo?state=ended', origin), 303)
  const res = await signInSandboxAccount(await getPayloadClient(), tenant, parsed.data.email, parsed.data.password)
  if (!res.ok) return res.error === 'ended' ? NextResponse.redirect(new URL('/demo?state=ended', origin), 303) : back(res.error)
  const out = NextResponse.redirect(new URL(res.to, origin), 303)
  if (res.payloadCookie) out.headers.append('Set-Cookie', res.payloadCookie)
  return out
}
