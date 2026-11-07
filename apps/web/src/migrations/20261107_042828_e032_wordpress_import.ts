import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-032 (ADR 011): WordPress import — import-connections/-nonces/-jobs/-refs, redirects, the Payload jobs queue
 * tables, users.contactEmail, orders.source + payment gateway fields, lessons.videoStatus, certificate legacy fields,
 * permission keys `import.view` / `import.run`. Schema only (like E-022): role templates get the new keys from
 * `pnpm seed` / the template sync (academy-admin = every academy permission).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_video_status" AS ENUM('ok', 'transfer', 'needs-action', 'external');
  CREATE TYPE "public"."enum_orders_source" AS ENUM('site', 'import');
  CREATE TYPE "public"."enum_import_jobs_status" AS ENUM('draft', 'ingesting', 'ready', 'dry-run', 'awaiting-confirm', 'media', 'committing', 'done', 'failed', 'rejected', 'cancelled');
  CREATE TYPE "public"."enum_import_jobs_mode" AS ENUM('push', 'bundle', 'rest', 'wxr');
  CREATE TYPE "public"."enum_import_refs_status" AS ENUM('linked', 'held', 'conflict', 'skipped');
  CREATE TYPE "public"."enum_redirects_source" AS ENUM('wp-import', 'manual');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'importMediaBatch', 'importCommitBatch', 'importSweep', 'importPurge');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'importMediaBatch', 'importCommitBatch', 'importSweep', 'importPurge');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'import.view';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'import.run';
  CREATE TABLE "import_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"label" varchar NOT NULL,
  	"connection_id" varchar NOT NULL,
  	"secret_hash" varchar NOT NULL,
  	"secret_sealed" varchar NOT NULL,
  	"job_id" integer,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"last_used_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "import_nonces" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"connection_id" integer NOT NULL,
  	"nonce" varchar NOT NULL,
  	"accepted" boolean DEFAULT true,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "import_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"label" varchar,
  	"status" "enum_import_jobs_status" DEFAULT 'draft' NOT NULL,
  	"mode" "enum_import_jobs_mode" NOT NULL,
  	"connection_id" integer,
  	"site" jsonb,
  	"manifest" jsonb,
  	"mappers" jsonb,
  	"choices" jsonb,
  	"bundle_file" varchar,
  	"plan_file" varchar,
  	"chunks" jsonb,
  	"rest_sealed" varchar,
  	"cursors" jsonb,
  	"counts" jsonb,
  	"progress" jsonb,
  	"report" jsonb,
  	"summary" jsonb,
  	"created_by_id" integer,
  	"confirmed_by_id" integer,
  	"confirmed_at" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"purge_after" timestamp(3) with time zone,
  	"purged_at" timestamp(3) with time zone,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "import_refs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"ref_key" varchar NOT NULL,
  	"site" varchar NOT NULL,
  	"kind" varchar NOT NULL,
  	"wp_id" varchar NOT NULL,
  	"target_collection" varchar,
  	"target_id" varchar,
  	"target_url" varchar,
  	"source_checksum" varchar,
  	"written_checksum" varchar,
  	"status" "enum_import_refs_status" DEFAULT 'linked' NOT NULL,
  	"reason" varchar,
  	"held_data" jsonb,
  	"source_url" varchar,
  	"job_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"code" numeric DEFAULT 301 NOT NULL,
  	"source" "enum_redirects_source" DEFAULT 'manual' NOT NULL,
  	"job_id" integer,
  	"hits" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users" ADD COLUMN "contact_email" varchar;
  ALTER TABLE "lessons" ADD COLUMN "video_status" "enum_lessons_video_status";
  ALTER TABLE "certificates" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "certificates" ADD COLUMN "legacy_code" varchar;
  ALTER TABLE "certificates" ADD COLUMN "legacy_url" varchar;
  ALTER TABLE "orders_payments" ADD COLUMN "gateway" varchar;
  ALTER TABLE "orders_payments" ADD COLUMN "gateway_title" varchar;
  ALTER TABLE "orders" ADD COLUMN "source" "enum_orders_source" DEFAULT 'site';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "import_connections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "import_nonces_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "import_jobs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "import_refs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "redirects_id" integer;
  ALTER TABLE "import_connections" ADD CONSTRAINT "import_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_connections" ADD CONSTRAINT "import_connections_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_connections" ADD CONSTRAINT "import_connections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_nonces" ADD CONSTRAINT "import_nonces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_nonces" ADD CONSTRAINT "import_nonces_connection_id_import_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."import_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_connection_id_import_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."import_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "redirects" ADD CONSTRAINT "redirects_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "import_connections_tenant_idx" ON "import_connections" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "import_connections_connection_id_idx" ON "import_connections" USING btree ("connection_id");
  CREATE INDEX "import_connections_job_idx" ON "import_connections" USING btree ("job_id");
  CREATE INDEX "import_connections_created_by_idx" ON "import_connections" USING btree ("created_by_id");
  CREATE INDEX "import_connections_updated_at_idx" ON "import_connections" USING btree ("updated_at");
  CREATE INDEX "import_connections_created_at_idx" ON "import_connections" USING btree ("created_at");
  CREATE INDEX "import_nonces_tenant_idx" ON "import_nonces" USING btree ("tenant_id");
  CREATE INDEX "import_nonces_connection_idx" ON "import_nonces" USING btree ("connection_id");
  CREATE INDEX "import_nonces_expires_at_idx" ON "import_nonces" USING btree ("expires_at");
  CREATE INDEX "import_nonces_updated_at_idx" ON "import_nonces" USING btree ("updated_at");
  CREATE INDEX "import_nonces_created_at_idx" ON "import_nonces" USING btree ("created_at");
  CREATE UNIQUE INDEX "connection_nonce_idx" ON "import_nonces" USING btree ("connection_id","nonce");
  CREATE INDEX "import_jobs_tenant_idx" ON "import_jobs" USING btree ("tenant_id");
  CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status");
  CREATE INDEX "import_jobs_connection_idx" ON "import_jobs" USING btree ("connection_id");
  CREATE INDEX "import_jobs_created_by_idx" ON "import_jobs" USING btree ("created_by_id");
  CREATE INDEX "import_jobs_confirmed_by_idx" ON "import_jobs" USING btree ("confirmed_by_id");
  CREATE INDEX "import_jobs_purge_after_idx" ON "import_jobs" USING btree ("purge_after");
  CREATE INDEX "import_jobs_updated_at_idx" ON "import_jobs" USING btree ("updated_at");
  CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs" USING btree ("created_at");
  CREATE INDEX "import_refs_tenant_idx" ON "import_refs" USING btree ("tenant_id");
  CREATE INDEX "import_refs_ref_key_idx" ON "import_refs" USING btree ("ref_key");
  CREATE INDEX "import_refs_site_idx" ON "import_refs" USING btree ("site");
  CREATE INDEX "import_refs_target_id_idx" ON "import_refs" USING btree ("target_id");
  CREATE INDEX "import_refs_status_idx" ON "import_refs" USING btree ("status");
  CREATE INDEX "import_refs_job_idx" ON "import_refs" USING btree ("job_id");
  CREATE INDEX "import_refs_updated_at_idx" ON "import_refs" USING btree ("updated_at");
  CREATE INDEX "import_refs_created_at_idx" ON "import_refs" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_site_kind_wpId_idx" ON "import_refs" USING btree ("tenant_id","site","kind","wp_id");
  CREATE INDEX "redirects_tenant_idx" ON "redirects" USING btree ("tenant_id");
  CREATE INDEX "redirects_from_idx" ON "redirects" USING btree ("from");
  CREATE INDEX "redirects_job_idx" ON "redirects" USING btree ("job_id");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_from_idx" ON "redirects" USING btree ("tenant_id","from");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_connections_fk" FOREIGN KEY ("import_connections_id") REFERENCES "public"."import_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_nonces_fk" FOREIGN KEY ("import_nonces_id") REFERENCES "public"."import_nonces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_jobs_fk" FOREIGN KEY ("import_jobs_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_refs_fk" FOREIGN KEY ("import_refs_id") REFERENCES "public"."import_refs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "certificates_legacy_id_idx" ON "certificates" USING btree ("legacy_id");
  CREATE INDEX "certificates_legacy_code_idx" ON "certificates" USING btree ("legacy_code");
  CREATE INDEX "orders_source_idx" ON "orders" USING btree ("source");
  CREATE INDEX "payload_locked_documents_rels_import_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("import_connections_id");
  CREATE INDEX "payload_locked_documents_rels_import_nonces_id_idx" ON "payload_locked_documents_rels" USING btree ("import_nonces_id");
  CREATE INDEX "payload_locked_documents_rels_import_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("import_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_import_refs_id_idx" ON "payload_locked_documents_rels" USING btree ("import_refs_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "import_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "import_nonces" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "import_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "import_refs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "redirects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "import_connections" CASCADE;
  DROP TABLE "import_nonces" CASCADE;
  DROP TABLE "import_jobs" CASCADE;
  DROP TABLE "import_refs" CASCADE;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_import_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_import_nonces_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_import_jobs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_import_refs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_redirects_fk";
  
  -- Roles holding the E-032 keys would block the cast back to the old enum.
  DELETE FROM "roles_permissions" WHERE "value" IN ('import.view', 'import.run');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX IF EXISTS "certificates_legacy_id_idx";
  DROP INDEX IF EXISTS "certificates_legacy_code_idx";
  DROP INDEX IF EXISTS "orders_source_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_import_connections_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_import_nonces_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_import_jobs_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_import_refs_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_redirects_id_idx";
  ALTER TABLE "users" DROP COLUMN "contact_email";
  ALTER TABLE "lessons" DROP COLUMN "video_status";
  ALTER TABLE "certificates" DROP COLUMN "legacy_id";
  ALTER TABLE "certificates" DROP COLUMN "legacy_code";
  ALTER TABLE "certificates" DROP COLUMN "legacy_url";
  ALTER TABLE "orders_payments" DROP COLUMN "gateway";
  ALTER TABLE "orders_payments" DROP COLUMN "gateway_title";
  ALTER TABLE "orders" DROP COLUMN "source";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "import_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "import_nonces_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "import_jobs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "import_refs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "redirects_id";
  DROP TYPE "public"."enum_lessons_video_status";
  DROP TYPE "public"."enum_orders_source";
  DROP TYPE "public"."enum_import_jobs_status";
  DROP TYPE "public"."enum_import_jobs_mode";
  DROP TYPE "public"."enum_import_refs_status";
  DROP TYPE "public"."enum_redirects_source";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
