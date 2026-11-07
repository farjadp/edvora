'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { useCallback, useState } from 'react'
import { normaliseCode } from './CodeField'
import type { CodeSubmit } from './twoFactorClient'

export type CodeState = {
  code: string
  setCode: (v: string) => void
  pending: boolean
  error: string | null
  hint: string | null
  lockedUntil: number | null
  clearLock: () => void
  /** Runs the submit; resolves true on success. Other outcomes become UI state. */
  run: (submit: CodeSubmit) => Promise<'ok' | 'conflict' | 'failed'>
}

/** Maps API outcomes of a code submit (ok / wrong / locked / conflict / network) to form state. */
export function useCodeSubmit(initialLockedUntil: number | null = null): CodeState {
  const [code, setCodeRaw] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [failures, setFailures] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(initialLockedUntil)

  const setCode = useCallback((v: string) => {
    setCodeRaw(v)
    setError(null)
  }, [])

  const run = useCallback<CodeState['run']>(
    async (submit) => {
      const clean = normaliseCode(code)
      if (clean.length !== 6) {
        setError('کد را شش‌رقمی وارد کنید.')
        return 'failed'
      }
      setPending(true)
      setError(null)
      const result = await submit(clean)
      setPending(false)
      switch (result.kind) {
        case 'ok':
          return 'ok'
        case 'wrong': {
          const n = failures + 1
          setFailures(n)
          setError(
            result.attemptsLeft !== undefined
              ? `کد درست نیست. ${toPersianDigits(result.attemptsLeft)} بار دیگر می‌توانید امتحان کنید.`
              : 'کد درست نیست. دوباره امتحان کنید.',
          )
          setHint(n >= 2 ? 'هنوز درست نیست؟ ساعت گوشی باید روی حالت خودکار باشد.' : null)
          setCodeRaw('')
          return 'failed'
        }
        case 'locked':
          setLockedUntil(result.lockedUntil)
          setCodeRaw('')
          return 'failed'
        case 'conflict':
          return 'conflict'
        case 'network':
          setError('اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید.')
          return 'failed'
        default:
          setError('مشکلی پیش آمد. دوباره تلاش کنید.')
          return 'failed'
      }
    },
    [code, failures],
  )

  const clearLock = useCallback(() => setLockedUntil(null), [])
  return { code, setCode, pending, error, hint, lockedUntil, clearLock, run }
}
