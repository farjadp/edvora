'use client'

import { useEffect } from 'react'
import type { FormState } from '../app/(frontend)/actions'

/** Full navigation when an action returns `redirectTo` (keeps the academy's Host header intact). */
export function useRedirectTo(state: FormState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo)
  }, [state?.redirectTo])
}
