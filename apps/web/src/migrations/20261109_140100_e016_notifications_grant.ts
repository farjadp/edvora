import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-016 data step: the role templates get the two new keys — academy-admin both (the template is "every academy
 * permission"), finance and support `notifications.view` (to answer "I didn't get the SMS"). Separate migration
 * because a new enum value can only be used after the transaction that added it has committed. Custom roles get
 * them only when an academy admin grants them.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "roles_permissions" ("order", "parent_id", "value")
  SELECT coalesce((SELECT max(rp."order") FROM "roles_permissions" rp WHERE rp."parent_id" = r."id"), 0) + k.n, r."id", k.v::"enum_roles_permissions"
  FROM "roles" r
  JOIN (VALUES ('academy-admin', 1, 'notifications.view'), ('academy-admin', 2, 'notifications.manage'), ('finance', 1, 'notifications.view'), ('support', 1, 'notifications.view')) AS k(t, n, v)
    ON r."template" = k.t
  WHERE NOT EXISTS (SELECT 1 FROM "roles_permissions" x WHERE x."parent_id" = r."id" AND x."value"::text = k.v);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "roles_permissions" WHERE "value"::text IN ('notifications.view', 'notifications.manage');`)
}
