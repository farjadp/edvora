import 'server-only'
import { monthStart, usageCost, type BudgetSettings } from '@edvora/core/ai'
import type { Rial } from '@edvora/core'
import type { Payload } from 'payload'
import { poolOf } from './chunks'

/** This calendar month's token use and its cost at the academy's own prices (integer rials). */
export async function monthUsage(payload: Payload, tenantId: number, budget: BudgetSettings): Promise<{ inputTokens: number; outputTokens: number; messages: number; cost: Rial }> {
  const res = await poolOf(payload).query<{ i: string; o: string; n: string }>(
    `SELECT coalesce(sum(input_tokens), 0) AS i, coalesce(sum(output_tokens), 0) AS o, count(*) FILTER (WHERE role = 'assistant') AS n FROM ai_messages WHERE tenant_id = $1 AND created_at >= $2`,
    [tenantId, monthStart()],
  )
  const u = { inputTokens: Number(res.rows[0]?.i ?? 0), outputTokens: Number(res.rows[0]?.o ?? 0) }
  return { ...u, messages: Number(res.rows[0]?.n ?? 0), cost: usageCost(u, budget) }
}
