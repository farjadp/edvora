import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * E-035: no schema change. This file only carries the schema snapshot (the .json beside it) after merging E-028
 * (gamification, PR #21) with develop's E-032 (WordPress import) and E-033 (live classes). Every table and column that
 * `payload migrate:create` would otherwise emit here is already created by 20261106_230018_e028_gamification, which runs
 * earlier. Keeping it empty makes the next `migrate:create` diff against the merged schema.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
