import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payment_methods_credentials_set" AS ENUM('merchantId', 'terminalId', 'username', 'password', 'apiKey');
  CREATE TYPE "public"."enum_payment_methods_wallets_network" AS ENUM('trc20', 'bep20');
  CREATE TYPE "public"."enum_payment_methods_manual_channels" AS ENUM('cash', 'pos', 'transfer', 'other');
  CREATE TYPE "public"."enum_payment_methods_method" AS ENUM('mellat', 'saman', 'zarinpal', 'zibal', 'idpay', 'payir', 'nextpay', 'usdt', 'card', 'manual');
  CREATE TYPE "public"."enum_payment_methods_mode" AS ENUM('sandbox', 'live');
  CREATE TYPE "public"."enum_payments_method" AS ENUM('mellat', 'saman', 'zarinpal', 'zibal', 'idpay', 'payir', 'nextpay', 'usdt', 'card', 'manual');
  CREATE TYPE "public"."enum_payments_status" AS ENUM('started', 'submitted', 'recorded', 'confirmed', 'rejected', 'failed');
  CREATE TYPE "public"."enum_payments_verified_by" AS ENUM('gateway', 'chain', 'people');
  CREATE TYPE "public"."enum_payments_usdt_network" AS ENUM('trc20', 'bep20');
  CREATE TYPE "public"."enum_payments_manual_channel" AS ENUM('cash', 'pos', 'transfer', 'other');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'payments.settings' BEFORE 'import.view';
  CREATE TABLE "payment_methods_credentials_set" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_payment_methods_credentials_set",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payment_methods_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"holder" varchar,
  	"bank" varchar
  );
  
  CREATE TABLE "payment_methods_wallets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" "enum_payment_methods_wallets_network",
  	"address" varchar
  );
  
  CREATE TABLE "payment_methods_manual_channels" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_payment_methods_manual_channels",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payment_methods" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"method" "enum_payment_methods_method" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"position" numeric DEFAULT 10,
  	"title" varchar NOT NULL,
  	"mode" "enum_payment_methods_mode" DEFAULT 'sandbox',
  	"instructions" varchar,
  	"credentials_sealed" varchar,
  	"usdt_legal_ack" boolean DEFAULT false,
  	"usdt_rate_toman" numeric,
  	"usdt_rate_rial" numeric,
  	"usdt_rate_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"order_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"course_id" integer,
  	"cohort_id" integer,
  	"method" "enum_payments_method" NOT NULL,
  	"method_row_id" integer,
  	"provider" varchar,
  	"method_title" varchar,
  	"amount" numeric NOT NULL,
  	"status" "enum_payments_status" DEFAULT 'started' NOT NULL,
  	"verified_by" "enum_payments_verified_by",
  	"reuse_key" varchar,
  	"authority" varchar,
  	"ref_id" varchar,
  	"card_pan" varchar,
  	"card_last4" varchar,
  	"card_tracking" varchar,
  	"card_paid_at" timestamp(3) with time zone,
  	"card_to_card" varchar,
  	"card_receipt_id" integer,
  	"usdt_network" "enum_payments_usdt_network",
  	"usdt_wallet" varchar,
  	"usdt_token_contract" varchar,
  	"usdt_rate_rial" numeric,
  	"usdt_units" varchar,
  	"usdt_display" varchar,
  	"usdt_quoted_at" timestamp(3) with time zone,
  	"usdt_tx_hash" varchar,
  	"usdt_confirmations" numeric,
  	"usdt_check" varchar,
  	"usdt_checked_at" timestamp(3) with time zone,
  	"manual_channel" "enum_payments_manual_channel",
  	"manual_reference" varchar,
  	"manual_paid_at" timestamp(3) with time zone,
  	"manual_note" varchar,
  	"recorded_by_id" integer,
  	"recorded_at" timestamp(3) with time zone,
  	"confirmed_by_id" integer,
  	"confirmed_at" timestamp(3) with time zone,
  	"rejected_by_id" integer,
  	"rejected_at" timestamp(3) with time zone,
  	"rejection_reason" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payments_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "payment_receipts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"owner_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_methods_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_receipts_id" integer;
  ALTER TABLE "payment_methods_credentials_set" ADD CONSTRAINT "payment_methods_credentials_set_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_methods_cards" ADD CONSTRAINT "payment_methods_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_methods_wallets" ADD CONSTRAINT "payment_methods_wallets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_methods_manual_channels" ADD CONSTRAINT "payment_methods_manual_channels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_method_row_id_payment_methods_id_fk" FOREIGN KEY ("method_row_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_card_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("card_receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_by_id_users_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments_numbers" ADD CONSTRAINT "payments_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payment_methods_credentials_set_order_idx" ON "payment_methods_credentials_set" USING btree ("order");
  CREATE INDEX "payment_methods_credentials_set_parent_idx" ON "payment_methods_credentials_set" USING btree ("parent_id");
  CREATE INDEX "payment_methods_cards_order_idx" ON "payment_methods_cards" USING btree ("_order");
  CREATE INDEX "payment_methods_cards_parent_id_idx" ON "payment_methods_cards" USING btree ("_parent_id");
  CREATE INDEX "payment_methods_wallets_order_idx" ON "payment_methods_wallets" USING btree ("_order");
  CREATE INDEX "payment_methods_wallets_parent_id_idx" ON "payment_methods_wallets" USING btree ("_parent_id");
  CREATE INDEX "payment_methods_manual_channels_order_idx" ON "payment_methods_manual_channels" USING btree ("order");
  CREATE INDEX "payment_methods_manual_channels_parent_idx" ON "payment_methods_manual_channels" USING btree ("parent_id");
  CREATE INDEX "payment_methods_tenant_idx" ON "payment_methods" USING btree ("tenant_id");
  CREATE INDEX "payment_methods_method_idx" ON "payment_methods" USING btree ("method");
  CREATE INDEX "payment_methods_updated_at_idx" ON "payment_methods" USING btree ("updated_at");
  CREATE INDEX "payment_methods_created_at_idx" ON "payment_methods" USING btree ("created_at");
  CREATE INDEX "payments_tenant_idx" ON "payments" USING btree ("tenant_id");
  CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");
  CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");
  CREATE INDEX "payments_course_idx" ON "payments" USING btree ("course_id");
  CREATE INDEX "payments_cohort_idx" ON "payments" USING btree ("cohort_id");
  CREATE INDEX "payments_method_idx" ON "payments" USING btree ("method");
  CREATE INDEX "payments_method_row_idx" ON "payments" USING btree ("method_row_id");
  CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");
  CREATE UNIQUE INDEX "payments_reuse_key_idx" ON "payments" USING btree ("reuse_key");
  CREATE INDEX "payments_authority_idx" ON "payments" USING btree ("authority");
  CREATE INDEX "payments_card_card_receipt_idx" ON "payments" USING btree ("card_receipt_id");
  CREATE INDEX "payments_usdt_usdt_tx_hash_idx" ON "payments" USING btree ("usdt_tx_hash");
  CREATE INDEX "payments_recorded_by_idx" ON "payments" USING btree ("recorded_by_id");
  CREATE INDEX "payments_confirmed_by_idx" ON "payments" USING btree ("confirmed_by_id");
  CREATE INDEX "payments_rejected_by_idx" ON "payments" USING btree ("rejected_by_id");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  CREATE INDEX "payments_numbers_order_parent_idx" ON "payments_numbers" USING btree ("order","parent_id");
  CREATE INDEX "payment_receipts_tenant_idx" ON "payment_receipts" USING btree ("tenant_id");
  CREATE INDEX "payment_receipts_owner_idx" ON "payment_receipts" USING btree ("owner_id");
  CREATE INDEX "payment_receipts_updated_at_idx" ON "payment_receipts" USING btree ("updated_at");
  CREATE INDEX "payment_receipts_created_at_idx" ON "payment_receipts" USING btree ("created_at");
  CREATE UNIQUE INDEX "payment_receipts_filename_idx" ON "payment_receipts" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_methods_fk" FOREIGN KEY ("payment_methods_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_receipts_fk" FOREIGN KEY ("payment_receipts_id") REFERENCES "public"."payment_receipts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_payment_methods_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_methods_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_locked_documents_rels_payment_receipts_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_receipts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payment_methods_credentials_set" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_methods_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_methods_wallets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_methods_manual_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payments_numbers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_receipts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payment_methods_credentials_set" CASCADE;
  DROP TABLE "payment_methods_cards" CASCADE;
  DROP TABLE "payment_methods_wallets" CASCADE;
  DROP TABLE "payment_methods_manual_channels" CASCADE;
  DROP TABLE "payment_methods" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "payments_numbers" CASCADE;
  DROP TABLE "payment_receipts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_methods_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_receipts_fk";
  
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'import.view', 'import.run');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "payload_locked_documents_rels_payment_methods_id_idx";
  DROP INDEX "payload_locked_documents_rels_payments_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_receipts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_methods_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_receipts_id";
  DROP TYPE "public"."enum_payment_methods_credentials_set";
  DROP TYPE "public"."enum_payment_methods_wallets_network";
  DROP TYPE "public"."enum_payment_methods_manual_channels";
  DROP TYPE "public"."enum_payment_methods_method";
  DROP TYPE "public"."enum_payment_methods_mode";
  DROP TYPE "public"."enum_payments_method";
  DROP TYPE "public"."enum_payments_status";
  DROP TYPE "public"."enum_payments_verified_by";
  DROP TYPE "public"."enum_payments_usdt_network";
  DROP TYPE "public"."enum_payments_manual_channel";`)
}
