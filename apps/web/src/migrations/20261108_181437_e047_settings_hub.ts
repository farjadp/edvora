import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-047 (ADR 019): settings hub — integration-settings (sealed provider keys), platform-settings global, Tenant fields
 * (logo dark, favicon, OG image, display font, social links, SEO, login texts, site toggles, legal pages, certificate
 * signer, message templates, plan limits) and the permission key `settings.integrations`. The key is granted to
 * existing academy-admin roles by the next migration (a new enum value cannot be used in the transaction that adds it).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_contact_social_platform" AS ENUM('instagram', 'telegram', 'linkedin', 'youtube', 'aparat', 'x', 'whatsapp', 'eitaa', 'bale', 'website');
  CREATE TYPE "public"."enum_tenants_message_templates_event" AS ENUM('otp', 'lead.received', 'payment.received', 'instalment.due', 'enrolment.confirmed', 'live.reminder', 'certificate.issued');
  CREATE TYPE "public"."enum_tenants_message_templates_channel" AS ENUM('sms', 'email');
  CREATE TYPE "public"."enum_tenants_font_display" AS ENUM('morabba', 'vazirmatn');
  CREATE TYPE "public"."enum_integration_settings_kind" AS ENUM('sms', 'email', 'live');
  CREATE TYPE "public"."enum_integration_settings_provider" AS ENUM('mock', 'kavenegar', 'smtp', 'bigbluebutton');
  CREATE TYPE "public"."enum_platform_settings_staff2fa" AS ENUM('env', 'required', 'optional');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'settings.integrations' BEFORE 'payments.settings';
  CREATE TABLE "tenants_contact_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_tenants_contact_social_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_message_templates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"event" "enum_tenants_message_templates_event" NOT NULL,
  	"channel" "enum_tenants_message_templates_channel" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"subject" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "integration_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"kind" "enum_integration_settings_kind" NOT NULL,
  	"provider" "enum_integration_settings_provider" DEFAULT 'mock' NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"config" jsonb,
  	"secret_sealed" varchar,
  	"secret_set_at" timestamp(3) with time zone,
  	"last_test_ok" boolean,
  	"last_test_at" timestamp(3) with time zone,
  	"last_test_message" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "platform_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"staff2fa" "enum_platform_settings_staff2fa" DEFAULT 'env',
  	"academy_providers_sms" boolean DEFAULT true,
  	"academy_providers_email" boolean DEFAULT true,
  	"academy_providers_live" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "tenants" ADD COLUMN "limits_max_students" numeric;
  ALTER TABLE "tenants" ADD COLUMN "limits_max_staff" numeric;
  ALTER TABLE "tenants" ADD COLUMN "limits_max_courses" numeric;
  ALTER TABLE "tenants" ADD COLUMN "limits_storage_mb" numeric;
  ALTER TABLE "tenants" ADD COLUMN "logo_dark_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "favicon_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "og_image_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "font_display" "enum_tenants_font_display" DEFAULT 'morabba';
  ALTER TABLE "tenants" ADD COLUMN "seo_title_suffix" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_keywords" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_noindex" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "login_texts_title" varchar;
  ALTER TABLE "tenants" ADD COLUMN "login_texts_subtitle" varchar;
  ALTER TABLE "tenants" ADD COLUMN "login_texts_help" varchar;
  ALTER TABLE "tenants" ADD COLUMN "toggles_journal" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "toggles_faculty" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "toggles_verify" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "toggles_lead_form" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "legal_terms_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "legal_privacy_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "legal_refund_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "certificate_signer_name" varchar;
  ALTER TABLE "tenants" ADD COLUMN "certificate_signer_title" varchar;
  ALTER TABLE "tenants" ADD COLUMN "certificate_signer_signature_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "integration_settings_id" integer;
  ALTER TABLE "tenants_contact_social" ADD CONSTRAINT "tenants_contact_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_message_templates" ADD CONSTRAINT "tenants_message_templates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tenants_contact_social_order_idx" ON "tenants_contact_social" USING btree ("_order");
  CREATE INDEX "tenants_contact_social_parent_id_idx" ON "tenants_contact_social" USING btree ("_parent_id");
  CREATE INDEX "tenants_message_templates_order_idx" ON "tenants_message_templates" USING btree ("_order");
  CREATE INDEX "tenants_message_templates_parent_id_idx" ON "tenants_message_templates" USING btree ("_parent_id");
  CREATE INDEX "integration_settings_tenant_idx" ON "integration_settings" USING btree ("tenant_id");
  CREATE INDEX "integration_settings_updated_at_idx" ON "integration_settings" USING btree ("updated_at");
  CREATE INDEX "integration_settings_created_at_idx" ON "integration_settings" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_kind_idx" ON "integration_settings" USING btree ("tenant_id","kind");
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_dark_id_media_id_fk" FOREIGN KEY ("logo_dark_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_favicon_id_media_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_legal_terms_id_pages_id_fk" FOREIGN KEY ("legal_terms_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_legal_privacy_id_pages_id_fk" FOREIGN KEY ("legal_privacy_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_legal_refund_id_pages_id_fk" FOREIGN KEY ("legal_refund_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_certificate_signer_signature_id_media_id_fk" FOREIGN KEY ("certificate_signer_signature_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_integration_settings_fk" FOREIGN KEY ("integration_settings_id") REFERENCES "public"."integration_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_logo_dark_idx" ON "tenants" USING btree ("logo_dark_id");
  CREATE INDEX "tenants_favicon_idx" ON "tenants" USING btree ("favicon_id");
  CREATE INDEX "tenants_og_image_idx" ON "tenants" USING btree ("og_image_id");
  CREATE INDEX "tenants_legal_legal_terms_idx" ON "tenants" USING btree ("legal_terms_id");
  CREATE INDEX "tenants_legal_legal_privacy_idx" ON "tenants" USING btree ("legal_privacy_id");
  CREATE INDEX "tenants_legal_legal_refund_idx" ON "tenants" USING btree ("legal_refund_id");
  CREATE INDEX "tenants_certificate_signer_certificate_signer_signature_idx" ON "tenants" USING btree ("certificate_signer_signature_id");
  CREATE INDEX "payload_locked_documents_rels_integration_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("integration_settings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants_contact_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tenants_message_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "integration_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "platform_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants_contact_social" CASCADE;
  DROP TABLE "tenants_message_templates" CASCADE;
  DROP TABLE "integration_settings" CASCADE;
  DROP TABLE "platform_settings" CASCADE;
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_logo_dark_id_media_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_favicon_id_media_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_og_image_id_media_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_legal_terms_id_pages_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_legal_privacy_id_pages_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_legal_refund_id_pages_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_certificate_signer_signature_id_media_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_integration_settings_fk";
  
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'payments.settings', 'import.view', 'import.run', 'ai.use', 'ai.manage');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "tenants_logo_dark_idx";
  DROP INDEX "tenants_favicon_idx";
  DROP INDEX "tenants_og_image_idx";
  DROP INDEX "tenants_legal_legal_terms_idx";
  DROP INDEX "tenants_legal_legal_privacy_idx";
  DROP INDEX "tenants_legal_legal_refund_idx";
  DROP INDEX "tenants_certificate_signer_certificate_signer_signature_idx";
  DROP INDEX "payload_locked_documents_rels_integration_settings_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "limits_max_students";
  ALTER TABLE "tenants" DROP COLUMN "limits_max_staff";
  ALTER TABLE "tenants" DROP COLUMN "limits_max_courses";
  ALTER TABLE "tenants" DROP COLUMN "limits_storage_mb";
  ALTER TABLE "tenants" DROP COLUMN "logo_dark_id";
  ALTER TABLE "tenants" DROP COLUMN "favicon_id";
  ALTER TABLE "tenants" DROP COLUMN "og_image_id";
  ALTER TABLE "tenants" DROP COLUMN "font_display";
  ALTER TABLE "tenants" DROP COLUMN "seo_title_suffix";
  ALTER TABLE "tenants" DROP COLUMN "seo_description";
  ALTER TABLE "tenants" DROP COLUMN "seo_keywords";
  ALTER TABLE "tenants" DROP COLUMN "seo_noindex";
  ALTER TABLE "tenants" DROP COLUMN "login_texts_title";
  ALTER TABLE "tenants" DROP COLUMN "login_texts_subtitle";
  ALTER TABLE "tenants" DROP COLUMN "login_texts_help";
  ALTER TABLE "tenants" DROP COLUMN "toggles_journal";
  ALTER TABLE "tenants" DROP COLUMN "toggles_faculty";
  ALTER TABLE "tenants" DROP COLUMN "toggles_verify";
  ALTER TABLE "tenants" DROP COLUMN "toggles_lead_form";
  ALTER TABLE "tenants" DROP COLUMN "legal_terms_id";
  ALTER TABLE "tenants" DROP COLUMN "legal_privacy_id";
  ALTER TABLE "tenants" DROP COLUMN "legal_refund_id";
  ALTER TABLE "tenants" DROP COLUMN "certificate_signer_name";
  ALTER TABLE "tenants" DROP COLUMN "certificate_signer_title";
  ALTER TABLE "tenants" DROP COLUMN "certificate_signer_signature_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "integration_settings_id";
  DROP TYPE "public"."enum_tenants_contact_social_platform";
  DROP TYPE "public"."enum_tenants_message_templates_event";
  DROP TYPE "public"."enum_tenants_message_templates_channel";
  DROP TYPE "public"."enum_tenants_font_display";
  DROP TYPE "public"."enum_integration_settings_kind";
  DROP TYPE "public"."enum_integration_settings_provider";
  DROP TYPE "public"."enum_platform_settings_staff2fa";`)
}
