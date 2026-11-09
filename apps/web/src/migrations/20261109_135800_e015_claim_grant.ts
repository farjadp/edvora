import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-015 data step: the seeded template roles that work leads get `leads.claim` (see the unassigned pool and take a
 * lead), matching ROLE_TEMPLATES: advisor, sales-manager, and academy-admin ("every academy permission").
 * Custom roles get it only when an academy admin adds it in the role editor. A membership with ownRecordsOnly never
 * sees the pool, whatever its roles hold. Separate migration: a new enum value is usable only after its commit.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "roles_permissions" ("order", "parent_id", "value")
  SELECT coalesce((SELECT max(rp."order") FROM "roles_permissions" rp WHERE rp."parent_id" = r."id"), 0) + 1, r."id", 'leads.claim'::"enum_roles_permissions"
  FROM "roles" r
  WHERE r."template" IN ('academy-admin', 'advisor', 'sales-manager')
    AND NOT EXISTS (SELECT 1 FROM "roles_permissions" x WHERE x."parent_id" = r."id" AND x."value"::text = 'leads.claim');`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "roles_permissions" rp USING "roles" r
  WHERE rp."parent_id" = r."id" AND r."template" IN ('academy-admin', 'advisor', 'sales-manager') AND rp."value"::text = 'leads.claim';`)
}
