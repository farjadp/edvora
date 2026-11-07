import { request } from '@playwright/test'
import { adminCreds, tenantId } from './tests/staff-helpers'

/**
 * Every e2e student buys a seat in the demo cohort (30 seats in the seed). After a few runs the cohort is full and
 * checkout correctly refuses, which would fail unrelated tests. Raise the demo cohorts' capacity before the run;
 * `pnpm seed` resets it. Demo tenant only. Best effort: without admin credentials nothing is changed.
 */
export default async function globalSetup(): Promise<void> {
  const port = Number(process.env.E2E_PORT ?? 3000)
  const { email, password } = adminCreds()
  if (!email || !password) return
  const api = await request.newContext({ baseURL: `http://demo.localhost:${port}` })
  try {
    const login = await api.post('/api/users/login', { data: { email, password } })
    if (!login.ok()) return
    const tid = await tenantId(api, 'demo')
    const res = await api.get(`/api/cohorts?where[tenant][equals]=${tid}&limit=50&depth=0`)
    const docs = ((await res.json()) as { docs?: { id: number; seats?: number | null }[] }).docs ?? []
    for (const c of docs) if ((c.seats ?? 0) < 500) await api.patch(`/api/cohorts/${c.id}`, { data: { seats: 500 } })
  } finally {
    await api.dispose()
  }
}
