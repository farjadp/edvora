import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-046 data step: academy-admin template roles get the two new keys (the template is "every academy permission").
 * Separate migration because a new enum value can only be used after the transaction that added it has committed.
 * Other roles get `ai.use` only when an academy admin grants it («دستیار هوشمند › تنظیمات» or the role editor).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "roles_permissions" ("order", "parent_id", "value")
  SELECT coalesce((SELECT max(rp."order") FROM "roles_permissions" rp WHERE rp."parent_id" = r."id"), 0) + k.n, r."id", k.v::"enum_roles_permissions"
  FROM "roles" r
  CROSS JOIN (VALUES (1, 'ai.use'), (2, 'ai.manage')) AS k(n, v)
  WHERE r."template" = 'academy-admin'
    AND NOT EXISTS (SELECT 1 FROM "roles_permissions" x WHERE x."parent_id" = r."id" AND x."value"::text = k.v);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "roles_permissions" rp USING "roles" r
  WHERE rp."parent_id" = r."id" AND r."template" = 'academy-admin' AND rp."value"::text IN ('ai.use', 'ai.manage');`)
}
