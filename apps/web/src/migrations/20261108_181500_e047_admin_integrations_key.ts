import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-047 (ADR 019 §3): academy-admin = every academy permission, so existing academy-admin roles get the new
 * `settings.integrations` key (new academies get it from the template). Idempotent. Separate from the schema
 * migration because Postgres cannot use an enum value in the transaction that added it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "roles_permissions" ("order", "parent_id", "value")
    SELECT COALESCE((SELECT MAX(rp."order") FROM "roles_permissions" rp WHERE rp."parent_id" = r."id"), 0) + 1, r."id", 'settings.integrations'
    FROM "roles" r
    WHERE r."template" = 'academy-admin'
      AND NOT EXISTS (SELECT 1 FROM "roles_permissions" x WHERE x."parent_id" = r."id" AND x."value" = 'settings.integrations');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "roles_permissions" rp USING "roles" r
    WHERE rp."parent_id" = r."id" AND r."template" = 'academy-admin' AND rp."value" = 'settings.integrations';
  `)
}
