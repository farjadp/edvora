import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-047 (ADR 019 §9): drops the legacy `tenants.zarinpal_merchant_id` after `e047_zarinpal_to_payment_methods` copied
 * it into payment-methods. Farjad approved the drop (2026-11-08). `down` restores the column (empty: the values
 * live sealed in payment-methods).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" DROP COLUMN "zarinpal_merchant_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" ADD COLUMN "zarinpal_merchant_id" varchar;`)
}
