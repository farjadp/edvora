import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-047 (ADR 019 §9): `tenants.zarinpal_merchant_id` → a Zarinpal row in `payment-methods` (E-045, ADR 017), where
 * gateway credentials live sealed. Since E-045 the checkout reads only payment-methods (or env), so the old column
 * was already unused. The row is created **disabled** (an admin checks title and mode, then switches it on in
 * Payments); the PaymentMethods hook seals the merchant id. An academy that already has a Zarinpal row keeps it.
 * The column is read with SQL (the field is gone from the config) and dropped by the next migration,
 * `e047_drop_tenant_zarinpal` (Farjad approved the drop, 2026-11-08). Idempotent.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const res = await db.execute(sql`SELECT "id", "zarinpal_merchant_id" AS "merchant" FROM "tenants" WHERE COALESCE(TRIM("zarinpal_merchant_id"), '') <> ''`)
  const rows = (res as unknown as { rows: { id: number; merchant: string }[] }).rows
  for (const t of rows) {
    const existing = await payload.find({ collection: 'payment-methods', where: { and: [{ tenant: { equals: t.id } }, { method: { equals: 'zarinpal' } }] }, limit: 1, depth: 0, overrideAccess: true, req })
    if (existing.docs.length) {
      payload.logger.warn(`e047: academy ${t.id} already has a Zarinpal payment method; the old tenants.zarinpal_merchant_id is not copied`)
      continue
    }
    await payload.create({
      collection: 'payment-methods',
      overrideAccess: true,
      req,
      data: { tenant: t.id, method: 'zarinpal', enabled: false, title: 'زرین‌پال', mode: process.env.ZARINPAL_SANDBOX === 'false' ? 'live' : 'sandbox', cred_merchantId: t.merchant.trim() } as never,
    })
  }
}

/** No automatic way back: the merchant id is sealed in payment-methods and is not copied out again. */
export async function down(_args: MigrateDownArgs): Promise<void> {}
