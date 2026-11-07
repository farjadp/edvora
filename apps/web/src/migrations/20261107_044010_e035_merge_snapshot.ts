import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * E-035 merge hygiene: NO database change. E-028 (gamification) and E-031 (rich text) were generated on separate
 * branches, so neither JSON snapshot holds the merged schema and the next `migrate:create` would re-create E-028's
 * tables. This migration only carries the merged snapshot (the .json next to it). The diff Payload generated was
 * statement-for-statement E-028's `up` (checked), which 20261106_230018_e028_gamification already applies.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
