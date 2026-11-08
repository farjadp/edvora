import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-047 (ADR 019 §9): `tenants.zarinpalMerchantId` → a Zarinpal row in `payment-methods` (E-045, ADR 017), where
 * gateway credentials live sealed. Since E-045 the checkout reads only payment-methods (or env), so the old field
 * was already unused. The row is created **disabled** (an admin checks title and mode, then switches it on in
 * Payments); the PaymentMethods hook seals the merchant id. The old value is cleared once moved. Academies that
 * already have a Zarinpal row keep it and keep their old value (nothing is overwritten). Idempotent.
 * The column itself stays (hidden) until Farjad approves dropping it.
 */
export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const tenants = await payload.find({ collection: 'tenants', where: { zarinpalMerchantId: { exists: true } }, depth: 0, limit: 1000, pagination: false, overrideAccess: true, req })
  for (const t of tenants.docs) {
    const merchantId = (t as { zarinpalMerchantId?: string | null }).zarinpalMerchantId?.trim()
    if (!merchantId) continue
    const existing = await payload.find({ collection: 'payment-methods', where: { and: [{ tenant: { equals: t.id } }, { method: { equals: 'zarinpal' } }] }, limit: 1, depth: 0, overrideAccess: true, req })
    if (existing.docs.length) {
      payload.logger.warn(`e047: academy ${t.id} already has a Zarinpal payment method; its old tenants.zarinpalMerchantId was left in place for review`)
      continue
    }
    await payload.create({
      collection: 'payment-methods',
      overrideAccess: true,
      req,
      data: { tenant: t.id, method: 'zarinpal', enabled: false, title: 'زرین‌پال', mode: process.env.ZARINPAL_SANDBOX === 'false' ? 'live' : 'sandbox', cred_merchantId: merchantId } as never,
    })
    await payload.db.drizzle.execute(sql`UPDATE "tenants" SET "zarinpal_merchant_id" = NULL WHERE "id" = ${t.id}`)
  }
}

/** No automatic way back: the merchant id is sealed in payment-methods and is not copied out again. */
export async function down(_args: MigrateDownArgs): Promise<void> {}
