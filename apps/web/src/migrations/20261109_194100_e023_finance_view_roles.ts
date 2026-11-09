import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-023 (ADR 021): the new `finance.view` key goes to roles made from the `finance` and `academy-admin` templates
 * (by template or key), so existing academies get the new desk tabs without a re-seed. Custom roles are left as the
 * academy set them. Separate from `e023_finance_desk` because Postgres cannot use an enum value in the transaction
 * that added it. Idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "roles_permissions" ("order", "parent_id", "value")
    SELECT COALESCE((SELECT MAX(p."order") FROM "roles_permissions" p WHERE p."parent_id" = r."id"), 0) + 1, r."id", 'finance.view'
    FROM "roles" r
    WHERE (r."template" IN ('finance', 'academy-admin') OR r."key" IN ('finance', 'academy-admin'))
      AND NOT EXISTS (SELECT 1 FROM "roles_permissions" x WHERE x."parent_id" = r."id" AND x."value" = 'finance.view');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DELETE FROM "roles_permissions" WHERE "value" = 'finance.view';`)
}
