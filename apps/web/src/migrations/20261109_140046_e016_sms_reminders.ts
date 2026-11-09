import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sms_log_rule" AS ENUM('instalment.due', 'instalment.overdue', 'followup.digest', 'live.reminder');
  CREATE TYPE "public"."enum_sms_log_status" AS ENUM('sending', 'sent', 'failed', 'dead', 'skipped', 'unknown');
  ALTER TYPE "public"."enum_tenants_message_templates_event" ADD VALUE IF NOT EXISTS 'instalment.overdue' BEFORE 'enrolment.confirmed';
  ALTER TYPE "public"."enum_tenants_message_templates_event" ADD VALUE IF NOT EXISTS 'followup.digest' BEFORE 'enrolment.confirmed';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE IF NOT EXISTS 'notifications.view' BEFORE 'reports.sales';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE IF NOT EXISTS 'notifications.manage' BEFORE 'reports.sales';
  CREATE TABLE "sms_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"key" varchar NOT NULL,
  	"rule" "enum_sms_log_rule" NOT NULL,
  	"stage" varchar,
  	"status" "enum_sms_log_status" NOT NULL,
  	"recipient_id" integer,
  	"to_masked" varchar,
  	"to" varchar,
  	"text" varchar,
  	"ref_collection" varchar,
  	"ref_id" numeric,
  	"attempts" numeric DEFAULT 0,
  	"next_attempt_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone,
  	"sent_at" timestamp(3) with time zone,
  	"provider" varchar,
  	"provider_message_id" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "reminder_settings" jsonb;
  ALTER TABLE "users" ADD COLUMN "sms_reminders" boolean DEFAULT true;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sms_log_id" integer;
  ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sms_log_tenant_idx" ON "sms_log" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "sms_log_key_idx" ON "sms_log" USING btree ("key");
  CREATE INDEX "sms_log_rule_idx" ON "sms_log" USING btree ("rule");
  CREATE INDEX "sms_log_status_idx" ON "sms_log" USING btree ("status");
  CREATE INDEX "sms_log_recipient_idx" ON "sms_log" USING btree ("recipient_id");
  CREATE INDEX "sms_log_ref_id_idx" ON "sms_log" USING btree ("ref_id");
  CREATE INDEX "sms_log_next_attempt_at_idx" ON "sms_log" USING btree ("next_attempt_at");
  CREATE INDEX "sms_log_updated_at_idx" ON "sms_log" USING btree ("updated_at");
  CREATE INDEX "sms_log_created_at_idx" ON "sms_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sms_log_fk" FOREIGN KEY ("sms_log_id") REFERENCES "public"."sms_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sms_log_id_idx" ON "payload_locked_documents_rels" USING btree ("sms_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sms_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sms_log" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sms_log_fk";
  
  ALTER TABLE "tenants_message_templates" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_tenants_message_templates_event";
  CREATE TYPE "public"."enum_tenants_message_templates_event" AS ENUM('otp', 'lead.received', 'payment.received', 'instalment.due', 'enrolment.confirmed', 'live.reminder', 'certificate.issued');
  ALTER TABLE "tenants_message_templates" ALTER COLUMN "event" SET DATA TYPE "public"."enum_tenants_message_templates_event" USING "event"::"public"."enum_tenants_message_templates_event";
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'settings.integrations', 'payments.settings', 'import.view', 'import.run', 'ai.use', 'ai.manage');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "payload_locked_documents_rels_sms_log_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "reminder_settings";
  ALTER TABLE "users" DROP COLUMN "sms_reminders";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sms_log_id";
  DROP TYPE "public"."enum_sms_log_rule";
  DROP TYPE "public"."enum_sms_log_status";`)
}
