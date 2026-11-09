import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_refunds_status" AS ENUM('requested', 'approved', 'refunded', 'rejected', 'cancelled');
  CREATE TYPE "public"."enum_finance_contacts_outcome" AS ENUM('reached', 'promised', 'no_answer', 'wrong_number', 'message_left');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'finance.view' BEFORE 'orders.view';
  CREATE TABLE "refunds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"order_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"course_id" integer,
  	"cohort_id" integer,
  	"amount" numeric NOT NULL,
  	"full" boolean,
  	"status" "enum_refunds_status" DEFAULT 'requested' NOT NULL,
  	"reason" varchar NOT NULL,
  	"requested_by_id" integer,
  	"requested_at" timestamp(3) with time zone,
  	"approved_by_id" integer,
  	"approved_at" timestamp(3) with time zone,
  	"refunded_by_id" integer,
  	"refunded_at" timestamp(3) with time zone,
  	"reference" varchar,
  	"closed_by_id" integer,
  	"closed_at" timestamp(3) with time zone,
  	"rejection_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "finance_contacts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"order_id" integer NOT NULL,
  	"instalment_index" numeric NOT NULL,
  	"user_id" integer NOT NULL,
  	"outcome" "enum_finance_contacts_outcome" NOT NULL,
  	"by_id" integer NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "refunds_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "finance_contacts_id" integer;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refunded_by_id_users_id_fk" FOREIGN KEY ("refunded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "finance_contacts" ADD CONSTRAINT "finance_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "finance_contacts" ADD CONSTRAINT "finance_contacts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "finance_contacts" ADD CONSTRAINT "finance_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "finance_contacts" ADD CONSTRAINT "finance_contacts_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "refunds_tenant_idx" ON "refunds" USING btree ("tenant_id");
  CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");
  CREATE INDEX "refunds_user_idx" ON "refunds" USING btree ("user_id");
  CREATE INDEX "refunds_course_idx" ON "refunds" USING btree ("course_id");
  CREATE INDEX "refunds_cohort_idx" ON "refunds" USING btree ("cohort_id");
  CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");
  CREATE INDEX "refunds_requested_by_idx" ON "refunds" USING btree ("requested_by_id");
  CREATE INDEX "refunds_approved_by_idx" ON "refunds" USING btree ("approved_by_id");
  CREATE INDEX "refunds_refunded_by_idx" ON "refunds" USING btree ("refunded_by_id");
  CREATE INDEX "refunds_refunded_at_idx" ON "refunds" USING btree ("refunded_at");
  CREATE INDEX "refunds_closed_by_idx" ON "refunds" USING btree ("closed_by_id");
  CREATE INDEX "refunds_updated_at_idx" ON "refunds" USING btree ("updated_at");
  CREATE INDEX "refunds_created_at_idx" ON "refunds" USING btree ("created_at");
  CREATE INDEX "finance_contacts_tenant_idx" ON "finance_contacts" USING btree ("tenant_id");
  CREATE INDEX "finance_contacts_order_idx" ON "finance_contacts" USING btree ("order_id");
  CREATE INDEX "finance_contacts_user_idx" ON "finance_contacts" USING btree ("user_id");
  CREATE INDEX "finance_contacts_by_idx" ON "finance_contacts" USING btree ("by_id");
  CREATE INDEX "finance_contacts_at_idx" ON "finance_contacts" USING btree ("at");
  CREATE INDEX "finance_contacts_updated_at_idx" ON "finance_contacts" USING btree ("updated_at");
  CREATE INDEX "finance_contacts_created_at_idx" ON "finance_contacts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refunds_fk" FOREIGN KEY ("refunds_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_finance_contacts_fk" FOREIGN KEY ("finance_contacts_id") REFERENCES "public"."finance_contacts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_refunds_id_idx" ON "payload_locked_documents_rels" USING btree ("refunds_id");
  CREATE INDEX "payload_locked_documents_rels_finance_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("finance_contacts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "refunds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "finance_contacts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "refunds" CASCADE;
  DROP TABLE "finance_contacts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_refunds_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_finance_contacts_fk";
  
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.claim', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'notifications.view', 'notifications.manage', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'settings.integrations', 'payments.settings', 'import.view', 'import.run', 'ai.use', 'ai.manage');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "payload_locked_documents_rels_refunds_id_idx";
  DROP INDEX "payload_locked_documents_rels_finance_contacts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "refunds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "finance_contacts_id";
  DROP TYPE "public"."enum_refunds_status";
  DROP TYPE "public"."enum_finance_contacts_outcome";`)
}
