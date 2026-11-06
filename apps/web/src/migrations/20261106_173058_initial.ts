import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_features" AS ENUM('site', 'lms', 'payments', 'crm', 'certificates', 'live', 'consulting', 'b2b');
  CREATE TYPE "public"."enum_tenants_plan" AS ENUM('starter', 'growth', 'pro');
  CREATE TYPE "public"."enum_tenants_default_theme" AS ENUM('light', 'dark');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'admin', 'advisor', 'instructor', 'company-manager', 'student');
  CREATE TYPE "public"."enum_courses_kind" AS ENUM('program', 'short', 'video', 'bundle');
  CREATE TYPE "public"."enum_courses_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_cohorts_mode" AS ENUM('online', 'in-person', 'hybrid');
  CREATE TYPE "public"."enum_cohorts_status" AS ENUM('preregistration', 'open', 'full', 'running', 'finished');
  CREATE TYPE "public"."enum_enrollments_status" AS ENUM('active', 'completed', 'cancelled');
  CREATE TYPE "public"."enum_certificates_status" AS ENUM('valid', 'revoked');
  CREATE TYPE "public"."enum_leads_activities_kind" AS ENUM('call', 'note', 'sms');
  CREATE TYPE "public"."enum_leads_status" AS ENUM('new', 'contacted', 'follow_up', 'enrolled', 'lost');
  CREATE TYPE "public"."enum_orders_instalments_status" AS ENUM('pending', 'paid');
  CREATE TYPE "public"."enum_orders_payments_status" AS ENUM('started', 'verified', 'failed');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('pending', 'partially_paid', 'paid', 'failed', 'refunded', 'cancelled');
  CREATE TYPE "public"."enum_coupons_kind" AS ENUM('percent', 'fixed');
  CREATE TABLE "tenants_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_features" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_tenants_features",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "tenants_services" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "tenants_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_client_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"logo_id" integer
  );
  
  CREATE TABLE "tenants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"plan" "enum_tenants_plan" DEFAULT 'starter',
  	"tagline" varchar,
  	"logo_id" integer,
  	"primary_color" varchar DEFAULT '#1A56DB',
  	"accent_color" varchar DEFAULT '#F59E0B',
  	"default_theme" "enum_tenants_default_theme" DEFAULT 'light',
  	"notice_enabled" boolean DEFAULT false,
  	"notice_text" varchar,
  	"manifesto" varchar,
  	"contact_phone" varchar,
  	"contact_email" varchar,
  	"certificate_prefix" varchar DEFAULT 'ED' NOT NULL,
  	"zarinpal_merchant_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_tenants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "courses_audience" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "courses_outcomes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "courses_syllabus" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"hours" numeric
  );
  
  CREATE TABLE "courses_faculty" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar,
  	"photo_id" integer
  );
  
  CREATE TABLE "courses_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL
  );
  
  CREATE TABLE "courses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"subtitle" varchar,
  	"kind" "enum_courses_kind" DEFAULT 'program' NOT NULL,
  	"program_code" varchar,
  	"status" "enum_courses_status" DEFAULT 'draft' NOT NULL,
  	"hero_image_id" integer,
  	"summary" varchar,
  	"price" numeric NOT NULL,
  	"max_instalments" numeric DEFAULT 1,
  	"duration_label" varchar,
  	"featured" boolean,
  	"requires_defense" boolean,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cohorts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"course_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"start_date" timestamp(3) with time zone NOT NULL,
  	"schedule" varchar,
  	"seats" numeric,
  	"seats_taken" numeric DEFAULT 0,
  	"mode" "enum_cohorts_mode" DEFAULT 'online',
  	"status" "enum_cohorts_status" DEFAULT 'open',
  	"price_override" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lessons_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"file_id" integer
  );
  
  CREATE TABLE "lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"course_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"module" varchar,
  	"order" numeric DEFAULT 1 NOT NULL,
  	"duration_minutes" numeric,
  	"is_free_preview" boolean,
  	"video_url" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enrollments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"user_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"order_id" integer,
  	"status" "enum_enrollments_status" DEFAULT 'active',
  	"defense_passed" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enrollments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"lessons_id" integer
  );
  
  CREATE TABLE "certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"code" varchar,
  	"holder_name" varchar NOT NULL,
  	"user_id" integer,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"final_project" varchar,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_certificates_status" DEFAULT 'valid',
  	"pdf_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads_activities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_leads_activities_kind" DEFAULT 'call',
  	"text" varchar NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"course_id" integer,
  	"message" varchar,
  	"status" "enum_leads_status" DEFAULT 'new' NOT NULL,
  	"advisor_id" integer,
  	"next_follow_up_at" timestamp(3) with time zone,
  	"source_page" varchar,
  	"source_utm_source" varchar,
  	"source_utm_campaign" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_instalments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"index" numeric NOT NULL,
  	"amount" numeric NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"status" "enum_orders_instalments_status" DEFAULT 'pending',
  	"paid_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "orders_payments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"instalment_index" numeric NOT NULL,
  	"provider" varchar NOT NULL,
  	"authority" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"status" "enum_orders_payments_status" DEFAULT 'started',
  	"ref_id" varchar,
  	"card_pan" varchar,
  	"error" varchar
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"user_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"subtotal" numeric NOT NULL,
  	"discount" numeric DEFAULT 0,
  	"total" numeric NOT NULL,
  	"coupon_code" varchar,
  	"status" "enum_orders_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coupons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"code" varchar NOT NULL,
  	"kind" "enum_coupons_kind" DEFAULT 'percent' NOT NULL,
  	"value" numeric NOT NULL,
  	"max_discount" numeric,
  	"valid_until" timestamp(3) with time zone,
  	"usage_limit" numeric,
  	"used_count" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "testimonials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"role" varchar,
  	"quote" varchar,
  	"video_url" varchar,
  	"photo_id" integer,
  	"approved_for_use" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"excerpt" varchar,
  	"cover_id" integer,
  	"author" varchar,
  	"published_at" timestamp(3) with time zone,
  	"body" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"alt" varchar NOT NULL,
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
  	"focal_y" numeric,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar
  );
  
  CREATE TABLE "otp_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"phone" varchar NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"consumed" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tenants_id" integer,
  	"users_id" integer,
  	"courses_id" integer,
  	"cohorts_id" integer,
  	"lessons_id" integer,
  	"enrollments_id" integer,
  	"certificates_id" integer,
  	"leads_id" integer,
  	"orders_id" integer,
  	"coupons_id" integer,
  	"testimonials_id" integer,
  	"posts_id" integer,
  	"media_id" integer,
  	"otp_codes_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants_domains" ADD CONSTRAINT "tenants_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_features" ADD CONSTRAINT "tenants_features_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_services" ADD CONSTRAINT "tenants_services_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_stats" ADD CONSTRAINT "tenants_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_client_logos" ADD CONSTRAINT "tenants_client_logos_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants_client_logos" ADD CONSTRAINT "tenants_client_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_audience" ADD CONSTRAINT "courses_audience_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_outcomes" ADD CONSTRAINT "courses_outcomes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_syllabus" ADD CONSTRAINT "courses_syllabus_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_faculty" ADD CONSTRAINT "courses_faculty_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "courses_faculty" ADD CONSTRAINT "courses_faculty_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_faq" ADD CONSTRAINT "courses_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "courses" ADD CONSTRAINT "courses_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_resources" ADD CONSTRAINT "lessons_resources_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_resources" ADD CONSTRAINT "lessons_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments_rels" ADD CONSTRAINT "enrollments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "enrollments_rels" ADD CONSTRAINT "enrollments_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_pdf_id_media_id_fk" FOREIGN KEY ("pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads_activities" ADD CONSTRAINT "leads_activities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_advisor_id_users_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_instalments" ADD CONSTRAINT "orders_instalments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_payments" ADD CONSTRAINT "orders_payments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cohorts_fk" FOREIGN KEY ("cohorts_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enrollments_fk" FOREIGN KEY ("enrollments_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_certificates_fk" FOREIGN KEY ("certificates_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coupons_fk" FOREIGN KEY ("coupons_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_otp_codes_fk" FOREIGN KEY ("otp_codes_id") REFERENCES "public"."otp_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_domains_order_idx" ON "tenants_domains" USING btree ("_order");
  CREATE INDEX "tenants_domains_parent_id_idx" ON "tenants_domains" USING btree ("_parent_id");
  CREATE INDEX "tenants_domains_domain_idx" ON "tenants_domains" USING btree ("domain");
  CREATE INDEX "tenants_features_order_idx" ON "tenants_features" USING btree ("order");
  CREATE INDEX "tenants_features_parent_idx" ON "tenants_features" USING btree ("parent_id");
  CREATE INDEX "tenants_services_order_idx" ON "tenants_services" USING btree ("_order");
  CREATE INDEX "tenants_services_parent_id_idx" ON "tenants_services" USING btree ("_parent_id");
  CREATE INDEX "tenants_stats_order_idx" ON "tenants_stats" USING btree ("_order");
  CREATE INDEX "tenants_stats_parent_id_idx" ON "tenants_stats" USING btree ("_parent_id");
  CREATE INDEX "tenants_client_logos_order_idx" ON "tenants_client_logos" USING btree ("_order");
  CREATE INDEX "tenants_client_logos_parent_id_idx" ON "tenants_client_logos" USING btree ("_parent_id");
  CREATE INDEX "tenants_client_logos_logo_idx" ON "tenants_client_logos" USING btree ("logo_id");
  CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");
  CREATE INDEX "tenants_logo_idx" ON "tenants" USING btree ("logo_id");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_tenants_order_idx" ON "users_tenants" USING btree ("_order");
  CREATE INDEX "users_tenants_parent_id_idx" ON "users_tenants" USING btree ("_parent_id");
  CREATE INDEX "users_tenants_tenant_idx" ON "users_tenants" USING btree ("tenant_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "courses_audience_order_idx" ON "courses_audience" USING btree ("_order");
  CREATE INDEX "courses_audience_parent_id_idx" ON "courses_audience" USING btree ("_parent_id");
  CREATE INDEX "courses_outcomes_order_idx" ON "courses_outcomes" USING btree ("_order");
  CREATE INDEX "courses_outcomes_parent_id_idx" ON "courses_outcomes" USING btree ("_parent_id");
  CREATE INDEX "courses_syllabus_order_idx" ON "courses_syllabus" USING btree ("_order");
  CREATE INDEX "courses_syllabus_parent_id_idx" ON "courses_syllabus" USING btree ("_parent_id");
  CREATE INDEX "courses_faculty_order_idx" ON "courses_faculty" USING btree ("_order");
  CREATE INDEX "courses_faculty_parent_id_idx" ON "courses_faculty" USING btree ("_parent_id");
  CREATE INDEX "courses_faculty_photo_idx" ON "courses_faculty" USING btree ("photo_id");
  CREATE INDEX "courses_faq_order_idx" ON "courses_faq" USING btree ("_order");
  CREATE INDEX "courses_faq_parent_id_idx" ON "courses_faq" USING btree ("_parent_id");
  CREATE INDEX "courses_tenant_idx" ON "courses" USING btree ("tenant_id");
  CREATE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");
  CREATE INDEX "courses_hero_image_idx" ON "courses" USING btree ("hero_image_id");
  CREATE INDEX "courses_updated_at_idx" ON "courses" USING btree ("updated_at");
  CREATE INDEX "courses_created_at_idx" ON "courses" USING btree ("created_at");
  CREATE INDEX "cohorts_tenant_idx" ON "cohorts" USING btree ("tenant_id");
  CREATE INDEX "cohorts_course_idx" ON "cohorts" USING btree ("course_id");
  CREATE INDEX "cohorts_updated_at_idx" ON "cohorts" USING btree ("updated_at");
  CREATE INDEX "cohorts_created_at_idx" ON "cohorts" USING btree ("created_at");
  CREATE INDEX "lessons_resources_order_idx" ON "lessons_resources" USING btree ("_order");
  CREATE INDEX "lessons_resources_parent_id_idx" ON "lessons_resources" USING btree ("_parent_id");
  CREATE INDEX "lessons_resources_file_idx" ON "lessons_resources" USING btree ("file_id");
  CREATE INDEX "lessons_tenant_idx" ON "lessons" USING btree ("tenant_id");
  CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_id");
  CREATE INDEX "lessons_updated_at_idx" ON "lessons" USING btree ("updated_at");
  CREATE INDEX "lessons_created_at_idx" ON "lessons" USING btree ("created_at");
  CREATE INDEX "enrollments_tenant_idx" ON "enrollments" USING btree ("tenant_id");
  CREATE INDEX "enrollments_user_idx" ON "enrollments" USING btree ("user_id");
  CREATE INDEX "enrollments_course_idx" ON "enrollments" USING btree ("course_id");
  CREATE INDEX "enrollments_cohort_idx" ON "enrollments" USING btree ("cohort_id");
  CREATE INDEX "enrollments_order_idx" ON "enrollments" USING btree ("order_id");
  CREATE INDEX "enrollments_updated_at_idx" ON "enrollments" USING btree ("updated_at");
  CREATE INDEX "enrollments_created_at_idx" ON "enrollments" USING btree ("created_at");
  CREATE INDEX "enrollments_rels_order_idx" ON "enrollments_rels" USING btree ("order");
  CREATE INDEX "enrollments_rels_parent_idx" ON "enrollments_rels" USING btree ("parent_id");
  CREATE INDEX "enrollments_rels_path_idx" ON "enrollments_rels" USING btree ("path");
  CREATE INDEX "enrollments_rels_lessons_id_idx" ON "enrollments_rels" USING btree ("lessons_id");
  CREATE INDEX "certificates_tenant_idx" ON "certificates" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "certificates_code_idx" ON "certificates" USING btree ("code");
  CREATE INDEX "certificates_user_idx" ON "certificates" USING btree ("user_id");
  CREATE INDEX "certificates_course_idx" ON "certificates" USING btree ("course_id");
  CREATE INDEX "certificates_cohort_idx" ON "certificates" USING btree ("cohort_id");
  CREATE INDEX "certificates_pdf_idx" ON "certificates" USING btree ("pdf_id");
  CREATE INDEX "certificates_updated_at_idx" ON "certificates" USING btree ("updated_at");
  CREATE INDEX "certificates_created_at_idx" ON "certificates" USING btree ("created_at");
  CREATE INDEX "leads_activities_order_idx" ON "leads_activities" USING btree ("_order");
  CREATE INDEX "leads_activities_parent_id_idx" ON "leads_activities" USING btree ("_parent_id");
  CREATE INDEX "leads_tenant_idx" ON "leads" USING btree ("tenant_id");
  CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");
  CREATE INDEX "leads_course_idx" ON "leads" USING btree ("course_id");
  CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");
  CREATE INDEX "leads_advisor_idx" ON "leads" USING btree ("advisor_id");
  CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");
  CREATE INDEX "orders_instalments_order_idx" ON "orders_instalments" USING btree ("_order");
  CREATE INDEX "orders_instalments_parent_id_idx" ON "orders_instalments" USING btree ("_parent_id");
  CREATE INDEX "orders_payments_order_idx" ON "orders_payments" USING btree ("_order");
  CREATE INDEX "orders_payments_parent_id_idx" ON "orders_payments" USING btree ("_parent_id");
  CREATE INDEX "orders_payments_authority_idx" ON "orders_payments" USING btree ("authority");
  CREATE INDEX "orders_tenant_idx" ON "orders" USING btree ("tenant_id");
  CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");
  CREATE INDEX "orders_course_idx" ON "orders" USING btree ("course_id");
  CREATE INDEX "orders_cohort_idx" ON "orders" USING btree ("cohort_id");
  CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "coupons_tenant_idx" ON "coupons" USING btree ("tenant_id");
  CREATE INDEX "coupons_code_idx" ON "coupons" USING btree ("code");
  CREATE INDEX "coupons_updated_at_idx" ON "coupons" USING btree ("updated_at");
  CREATE INDEX "coupons_created_at_idx" ON "coupons" USING btree ("created_at");
  CREATE INDEX "testimonials_tenant_idx" ON "testimonials" USING btree ("tenant_id");
  CREATE INDEX "testimonials_photo_idx" ON "testimonials" USING btree ("photo_id");
  CREATE INDEX "testimonials_updated_at_idx" ON "testimonials" USING btree ("updated_at");
  CREATE INDEX "testimonials_created_at_idx" ON "testimonials" USING btree ("created_at");
  CREATE INDEX "posts_tenant_idx" ON "posts" USING btree ("tenant_id");
  CREATE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_cover_idx" ON "posts" USING btree ("cover_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "media_tenant_idx" ON "media" USING btree ("tenant_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "otp_codes_phone_idx" ON "otp_codes" USING btree ("phone");
  CREATE INDEX "otp_codes_updated_at_idx" ON "otp_codes" USING btree ("updated_at");
  CREATE INDEX "otp_codes_created_at_idx" ON "otp_codes" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_courses_id_idx" ON "payload_locked_documents_rels" USING btree ("courses_id");
  CREATE INDEX "payload_locked_documents_rels_cohorts_id_idx" ON "payload_locked_documents_rels" USING btree ("cohorts_id");
  CREATE INDEX "payload_locked_documents_rels_lessons_id_idx" ON "payload_locked_documents_rels" USING btree ("lessons_id");
  CREATE INDEX "payload_locked_documents_rels_enrollments_id_idx" ON "payload_locked_documents_rels" USING btree ("enrollments_id");
  CREATE INDEX "payload_locked_documents_rels_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("certificates_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("leads_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_coupons_id_idx" ON "payload_locked_documents_rels" USING btree ("coupons_id");
  CREATE INDEX "payload_locked_documents_rels_testimonials_id_idx" ON "payload_locked_documents_rels" USING btree ("testimonials_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_otp_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("otp_codes_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tenants_domains" CASCADE;
  DROP TABLE "tenants_features" CASCADE;
  DROP TABLE "tenants_services" CASCADE;
  DROP TABLE "tenants_stats" CASCADE;
  DROP TABLE "tenants_client_logos" CASCADE;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_tenants" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "courses_audience" CASCADE;
  DROP TABLE "courses_outcomes" CASCADE;
  DROP TABLE "courses_syllabus" CASCADE;
  DROP TABLE "courses_faculty" CASCADE;
  DROP TABLE "courses_faq" CASCADE;
  DROP TABLE "courses" CASCADE;
  DROP TABLE "cohorts" CASCADE;
  DROP TABLE "lessons_resources" CASCADE;
  DROP TABLE "lessons" CASCADE;
  DROP TABLE "enrollments" CASCADE;
  DROP TABLE "enrollments_rels" CASCADE;
  DROP TABLE "certificates" CASCADE;
  DROP TABLE "leads_activities" CASCADE;
  DROP TABLE "leads" CASCADE;
  DROP TABLE "orders_instalments" CASCADE;
  DROP TABLE "orders_payments" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "coupons" CASCADE;
  DROP TABLE "testimonials" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "otp_codes" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_tenants_features";
  DROP TYPE "public"."enum_tenants_plan";
  DROP TYPE "public"."enum_tenants_default_theme";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_courses_kind";
  DROP TYPE "public"."enum_courses_status";
  DROP TYPE "public"."enum_cohorts_mode";
  DROP TYPE "public"."enum_cohorts_status";
  DROP TYPE "public"."enum_enrollments_status";
  DROP TYPE "public"."enum_certificates_status";
  DROP TYPE "public"."enum_leads_activities_kind";
  DROP TYPE "public"."enum_leads_status";
  DROP TYPE "public"."enum_orders_instalments_status";
  DROP TYPE "public"."enum_orders_payments_status";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_coupons_kind";`)
}
