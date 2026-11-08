'use server'

/**
 * E-046 — server actions of «دستیار هوشمند». Every input is Zod-validated; every action re-checks the staff session
 * and `ai.manage` in the academy of this Host, and returns a state instead of redirecting (AGENTS.md, ADR 005).
 */
import { toLatinDigits } from '@edvora/core'
import { AI_PROVIDERS } from '@edvora/integrations/ai'
import { z } from 'zod'
import { writeAudit } from '../../../../../hooks/audit'
import { addMemory, decideMemory, reindexAll, removeDocument } from '../../../../../lib/ai/knowledge'
import { aiActor } from '../../../../../lib/ai/pageAccess'
import { loadAiConfig, providerFor, sealKey, modelFor, effectiveProviderName } from '../../../../../lib/ai/settings'

export type AiActionState = { ok: boolean; message: string; reload?: boolean } | null

const DENIED: AiActionState = { ok: false, message: 'برای این کار دسترسی «تنظیم دستیار هوشمند» در این آکادمی لازم است.' }
const FAILED: AiActionState = { ok: false, message: 'ذخیره ناموفق بود؛ دوباره امتحان کنید.' }

const num = z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : Number(toLatinDigits(v).replace(/[,٬]/g, ''))) : v), z.number().int().min(0).max(1e15).nullable())
const bool = z.preprocess((v) => v === 'on' || v === 'true', z.boolean())

const Settings = z.object({
  enabled: bool,
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().max(300).optional().transform((v) => v || null),
  newApiKey: z.string().trim().max(500).optional(),
  clearApiKey: bool,
  embeddingModel: z.string().trim().max(100).optional().transform((v) => v || null),
  names: bool,
  nationalCodes: bool,
  phones: bool,
  emails: bool,
  perMinute: num,
  perDay: num,
  monthlyTokenLimit: num,
  monthlyCostLimitRial: num,
  inputPricePerMillionRial: num,
  outputPricePerMillionRial: num,
})

export async function saveSettingsAction(_: AiActionState, form: FormData): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const p = Settings.safeParse(Object.fromEntries(form))
  if (!p.success) return { ok: false, message: 'برخی مقدارها معتبر نیستند؛ عددها را بدون واحد بنویسید.' }
  const v = p.data
  if (v.provider === 'custom') {
    if (!v.baseUrl || !/^https:\/\/[^\s/]+/.test(v.baseUrl)) return { ok: false, message: 'برای درگاه سازگار با OpenAI نشانی https کامل لازم است (مثلاً https://api.example.ir/v1).' }
  }
  const data = {
    enabled: v.enabled,
    provider: v.provider,
    model: v.model,
    baseUrl: v.provider === 'custom' ? v.baseUrl : null,
    embeddingModel: v.embeddingModel,
    privacy: { names: v.names, nationalCodes: v.nationalCodes, phones: v.phones, emails: v.emails },
    limits: {
      perMinute: v.perMinute ?? 20,
      perDay: v.perDay ?? 300,
      monthlyTokenLimit: v.monthlyTokenLimit,
      monthlyCostLimitRial: v.monthlyCostLimitRial,
      inputPricePerMillionRial: v.inputPricePerMillionRial,
      outputPricePerMillionRial: v.outputPricePerMillionRial,
    },
    ...(v.newApiKey ? sealKey(v.newApiKey) : v.clearApiKey ? { apiKeySealed: null, apiKeyHint: null } : {}),
  }
  try {
    const current = await loadAiConfig(s.req.payload, s.tenant.id)
    // The sealed key is a hidden field with no API access: written here, as server code, after the ai.manage check.
    // `req` carries the user, so the collection's guard (tenant + ai.manage) and audit hook still run.
    if (current.id) await s.req.payload.update({ collection: 'ai-settings', id: current.id, data, req: s.req, overrideAccess: true })
    else await s.req.payload.create({ collection: 'ai-settings', data: { tenant: s.tenant.id, ...data }, req: s.req, overrideAccess: true })
    if (v.newApiKey || v.clearApiKey) await writeAudit(s.req, { tenants: [s.tenant.id], action: v.newApiKey ? 'ai.key.set' : 'ai.key.cleared', collection: 'ai-settings', docId: current.id ?? '-' })
    return { ok: true, message: 'تنظیمات دستیار ذخیره شد.', reload: true }
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai settings save failed' })
    return FAILED
  }
}

export async function testConnectionAction(_: AiActionState): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const cfg = await loadAiConfig(s.req.payload, s.tenant.id)
  let result: { ok: true } | { ok: false; error: string }
  try {
    result = await providerFor(cfg).test(modelFor(cfg))
  } catch (err) {
    result = { ok: false, error: (err as Error).message }
  }
  const at = new Date().toISOString()
  if (cfg.id) await s.req.payload.update({ collection: 'ai-settings', id: cfg.id, data: { lastTest: { ok: result.ok, at, ...(result.ok ? {} : { error: result.error.slice(0, 300) }) } }, req: s.req, overrideAccess: true }).catch(() => null)
  const name = effectiveProviderName(cfg)
  return result.ok
    ? { ok: true, message: name === 'mock' ? 'اتصال آزمایشی برقرار است (ارائه‌دهندهٔ آزمایشی، بدون اتصال واقعی).' : 'اتصال برقرار است؛ ارائه‌دهنده با همین کلید و مدل پاسخ داد.', reload: true }
    : { ok: false, message: `اتصال برقرار نشد: ${result.error.slice(0, 200)}`, reload: true }
}

const RoleToggle = z.object({ roleId: z.coerce.number().int().positive(), grant: bool })

/** Gives or removes `ai.use` on a role. Runs as the person, so the role rules (roles.manage, no escalation) apply. */
export async function toggleRoleAction(_: AiActionState, form: FormData): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const p = RoleToggle.safeParse(Object.fromEntries(form))
  if (!p.success) return FAILED
  try {
    const role = await s.req.payload.findByID({ collection: 'roles', id: p.data.roleId, depth: 0, req: s.req, user: s.user, overrideAccess: false })
    const perms = new Set(role.permissions ?? [])
    if (p.data.grant) perms.add('ai.use')
    else perms.delete('ai.use')
    await s.req.payload.update({ collection: 'roles', id: role.id, data: { permissions: [...perms] as typeof role.permissions }, req: s.req, user: s.user, overrideAccess: false })
    return { ok: true, message: p.data.grant ? `نقش «${role.name}» اکنون می‌تواند از دستیار استفاده کند.` : `دسترسی نقش «${role.name}» به دستیار برداشته شد.`, reload: true }
  } catch (err) {
    s.req.payload.logger.warn({ err, msg: 'ai role toggle refused' })
    return { ok: false, message: 'تغییر نقش ممکن نشد؛ برای این کار دسترسی «ساختن و ویرایش نقش‌ها» لازم است.' }
  }
}

const IdOnly = z.object({ id: z.coerce.number().int().positive() })

export async function deleteDocumentAction(_: AiActionState, form: FormData): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const p = IdOnly.safeParse(Object.fromEntries(form))
  if (!p.success) return FAILED
  try {
    return (await removeDocument(s.req, s.tenant.id, p.data.id)) ? { ok: true, message: 'سند و نمایه‌اش حذف شد.', reload: true } : { ok: false, message: 'سند پیدا نشد.' }
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai document delete failed' })
    return FAILED
  }
}

export async function reindexAction(_: AiActionState): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  try {
    const r = await reindexAll(s.req, s.tenant.id)
    return { ok: r.failed === 0, message: r.failed ? `${r.failed} سند نمایه نشد؛ اتصال ارائه‌دهنده را آزمایش کنید.` : 'نمایهٔ همهٔ اسناد و یادداشت‌ها با مدل فعلی ساخته شد.', reload: true }
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai reindex failed' })
    return FAILED
  }
}

const Memory = z.object({ id: z.coerce.number().int().positive(), decision: z.enum(['approve', 'reject', 'delete']), text: z.string().max(800).optional() })

export async function decideMemoryAction(_: AiActionState, form: FormData): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const p = Memory.safeParse(Object.fromEntries(form))
  if (!p.success) return FAILED
  try {
    const ok = await decideMemory(s.req, s.tenant.id, p.data.id, p.data.decision, p.data.text)
    const done = { approve: 'یادداشت تأیید شد و از این پس در پاسخ‌ها استفاده می‌شود.', reject: 'یادداشت رد شد.', delete: 'یادداشت حذف شد.' }[p.data.decision]
    return ok ? { ok: true, message: done, reload: true } : { ok: false, message: 'یادداشت پیدا نشد.' }
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai memory decision failed' })
    return FAILED
  }
}

const NewMemory = z.object({ text: z.string().trim().min(5).max(800) })

export async function addMemoryAction(_: AiActionState, form: FormData): Promise<AiActionState> {
  const s = await aiActor('manage')
  if (!s) return DENIED
  const p = NewMemory.safeParse(Object.fromEntries(form))
  if (!p.success) return { ok: false, message: 'متن یادداشت باید دست‌کم ۵ نویسه باشد.' }
  try {
    await addMemory(s.req, s.tenant.id, p.data.text)
    return { ok: true, message: 'یادداشت افزوده شد.', reload: true }
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai memory add failed' })
    return FAILED
  }
}
