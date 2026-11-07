import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_live_sessions_recordings_status" AS ENUM('ready', 'waiting', 'copying', 'copied', 'failed');
  CREATE TYPE "public"."enum_live_sessions_status" AS ENUM('scheduled', 'live', 'ended', 'cancelled');
  CREATE TYPE "public"."enum_attendance_source" AS ENUM('webhook', 'summary', 'manual', 'import');
  CREATE TABLE "live_sessions_recordings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"provider_recording_id" varchar NOT NULL,
  	"format" varchar,
  	"duration_sec" numeric,
  	"status" "enum_live_sessions_recordings_status" DEFAULT 'ready',
  	"storage_key" varchar,
  	"size_bytes" numeric,
  	"copied_at" timestamp(3) with time zone,
  	"error" varchar,
  	"url" varchar,
  	"lesson_id" integer
  );
  
  CREATE TABLE "live_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"instructor_id" integer,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"duration_min" numeric DEFAULT 90 NOT NULL,
  	"join_window_min" numeric DEFAULT 10,
  	"status" "enum_live_sessions_status" DEFAULT 'scheduled',
  	"record" boolean DEFAULT true,
  	"waiting_room" boolean DEFAULT false,
  	"provider" varchar,
  	"provider_room_id" varchar,
  	"create_time" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "attendance" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"session_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"course_id" integer,
  	"cohort_id" integer,
  	"joined_at" timestamp(3) with time zone,
  	"left_at" timestamp(3) with time zone,
  	"minutes" numeric DEFAULT 0,
  	"open_since" timestamp(3) with time zone,
  	"source" "enum_attendance_source" DEFAULT 'webhook',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "live_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"provider" varchar NOT NULL,
  	"event_id" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"session_id" integer,
  	"occurred_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_sessions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "attendance_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_events_id" integer;
  ALTER TABLE "live_sessions_recordings" ADD CONSTRAINT "live_sessions_recordings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_sessions_recordings" ADD CONSTRAINT "live_sessions_recordings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_events" ADD CONSTRAINT "live_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_events" ADD CONSTRAINT "live_events_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "live_sessions_recordings_order_idx" ON "live_sessions_recordings" USING btree ("_order");
  CREATE INDEX "live_sessions_recordings_parent_id_idx" ON "live_sessions_recordings" USING btree ("_parent_id");
  CREATE INDEX "live_sessions_recordings_lesson_idx" ON "live_sessions_recordings" USING btree ("lesson_id");
  CREATE INDEX "live_sessions_tenant_idx" ON "live_sessions" USING btree ("tenant_id");
  CREATE INDEX "live_sessions_course_idx" ON "live_sessions" USING btree ("course_id");
  CREATE INDEX "live_sessions_cohort_idx" ON "live_sessions" USING btree ("cohort_id");
  CREATE INDEX "live_sessions_instructor_idx" ON "live_sessions" USING btree ("instructor_id");
  CREATE INDEX "live_sessions_starts_at_idx" ON "live_sessions" USING btree ("starts_at");
  CREATE INDEX "live_sessions_status_idx" ON "live_sessions" USING btree ("status");
  CREATE INDEX "live_sessions_provider_room_id_idx" ON "live_sessions" USING btree ("provider_room_id");
  CREATE INDEX "live_sessions_updated_at_idx" ON "live_sessions" USING btree ("updated_at");
  CREATE INDEX "live_sessions_created_at_idx" ON "live_sessions" USING btree ("created_at");
  CREATE INDEX "attendance_tenant_idx" ON "attendance" USING btree ("tenant_id");
  CREATE INDEX "attendance_session_idx" ON "attendance" USING btree ("session_id");
  CREATE INDEX "attendance_user_idx" ON "attendance" USING btree ("user_id");
  CREATE INDEX "attendance_course_idx" ON "attendance" USING btree ("course_id");
  CREATE INDEX "attendance_cohort_idx" ON "attendance" USING btree ("cohort_id");
  CREATE INDEX "attendance_updated_at_idx" ON "attendance" USING btree ("updated_at");
  CREATE INDEX "attendance_created_at_idx" ON "attendance" USING btree ("created_at");
  CREATE UNIQUE INDEX "session_user_idx" ON "attendance" USING btree ("session_id","user_id");
  CREATE INDEX "live_events_tenant_idx" ON "live_events" USING btree ("tenant_id");
  CREATE INDEX "live_events_session_idx" ON "live_events" USING btree ("session_id");
  CREATE INDEX "live_events_updated_at_idx" ON "live_events" USING btree ("updated_at");
  CREATE INDEX "live_events_created_at_idx" ON "live_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_provider_eventId_idx" ON "live_events" USING btree ("tenant_id","provider","event_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_sessions_fk" FOREIGN KEY ("live_sessions_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_attendance_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_events_fk" FOREIGN KEY ("live_events_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_live_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("live_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_attendance_id_idx" ON "payload_locked_documents_rels" USING btree ("attendance_id");
  CREATE INDEX "payload_locked_documents_rels_live_events_id_idx" ON "payload_locked_documents_rels" USING btree ("live_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_sessions_recordings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "attendance" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "live_sessions_recordings" CASCADE;
  DROP TABLE "live_sessions" CASCADE;
  DROP TABLE "attendance" CASCADE;
  DROP TABLE "live_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_live_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_attendance_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_live_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_live_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_attendance_id_idx";
  DROP INDEX "payload_locked_documents_rels_live_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "live_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "attendance_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "live_events_id";
  DROP TYPE "public"."enum_live_sessions_recordings_status";
  DROP TYPE "public"."enum_live_sessions_status";
  DROP TYPE "public"."enum_attendance_source";`)
}
