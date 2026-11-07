import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_live_sessions_recordings_status" ADD VALUE 'waiting' BEFORE 'copied';
  ALTER TYPE "public"."enum_live_sessions_recordings_status" ADD VALUE 'copying' BEFORE 'copied';
  ALTER TABLE "live_sessions_recordings" ADD COLUMN "storage_key" varchar;
  ALTER TABLE "live_sessions_recordings" ADD COLUMN "size_bytes" numeric;
  ALTER TABLE "live_sessions_recordings" ADD COLUMN "copied_at" timestamp(3) with time zone;
  ALTER TABLE "live_sessions_recordings" ADD COLUMN "error" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_sessions_recordings" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "live_sessions_recordings" ALTER COLUMN "status" SET DEFAULT 'ready'::text;
  DROP TYPE "public"."enum_live_sessions_recordings_status";
  CREATE TYPE "public"."enum_live_sessions_recordings_status" AS ENUM('ready', 'copied', 'failed');
  ALTER TABLE "live_sessions_recordings" ALTER COLUMN "status" SET DEFAULT 'ready'::"public"."enum_live_sessions_recordings_status";
  ALTER TABLE "live_sessions_recordings" ALTER COLUMN "status" SET DATA TYPE "public"."enum_live_sessions_recordings_status" USING "status"::"public"."enum_live_sessions_recordings_status";
  ALTER TABLE "live_sessions_recordings" DROP COLUMN "storage_key";
  ALTER TABLE "live_sessions_recordings" DROP COLUMN "size_bytes";
  ALTER TABLE "live_sessions_recordings" DROP COLUMN "copied_at";
  ALTER TABLE "live_sessions_recordings" DROP COLUMN "error";`)
}
