import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_gamification_weekend_days" AS ENUM('saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  CREATE TYPE "public"."enum_tenants_gamification_breaks_startsat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_tenants_gamification_breaks_endsat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_tenants_gamification_audience" AS ENUM('both', 'students', 'staff');
  CREATE TYPE "public"."enum_tenants_gamification_week_start" AS ENUM('saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  CREATE TYPE "public"."enum_cohorts_breaks_startsat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_cohorts_breaks_endsat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_learning_events_type" AS ENUM('lesson.completed', 'quiz.passed', 'assignment.submitted', 'live.attended', 'assignment.passed', 'lesson.marked', 'course.completed', 'defense.passed', 'weekly.goal', 'badge.earned', 'reversal');
  CREATE TYPE "public"."enum_leads_follow_ups_outcome" AS ENUM('reached', 'no_answer', 'callback', 'wrong_number', 'not_interested', 'status_changed', 'date_moved');
  CREATE TYPE "public"."enum_leads_last_outcome" AS ENUM('reached', 'no_answer', 'callback', 'wrong_number', 'not_interested');
  CREATE TABLE "tenants_gamification_weekend_days" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_tenants_gamification_weekend_days",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "tenants_gamification_breaks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"startsat_tz" "enum_tenants_gamification_breaks_startsat_tz" DEFAULT 'Asia/Tehran' NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"endsat_tz" "enum_tenants_gamification_breaks_endsat_tz" DEFAULT 'Asia/Tehran' NOT NULL
  );
  
  CREATE TABLE "cohorts_breaks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"startsat_tz" "enum_cohorts_breaks_startsat_tz" DEFAULT 'Asia/Tehran' NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"endsat_tz" "enum_cohorts_breaks_endsat_tz" DEFAULT 'Asia/Tehran' NOT NULL
  );
  
  CREATE TABLE "learning_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"user_id" integer NOT NULL,
  	"enrollment_id" integer,
  	"course_id" integer,
  	"cohort_id" integer,
  	"type" "enum_learning_events_type" NOT NULL,
  	"source_id" varchar,
  	"xp" numeric DEFAULT 0 NOT NULL,
  	"requested_xp" numeric DEFAULT 0,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"reverses" varchar,
  	"meta" jsonb,
  	"actor_id" integer,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads_follow_ups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"outcome" "enum_leads_follow_ups_outcome" NOT NULL,
  	"by_id" integer,
  	"due_at" timestamp(3) with time zone,
  	"note" varchar
  );
  
  ALTER TABLE "tenants" ADD COLUMN "gamification_enabled" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_audience" "enum_tenants_gamification_audience" DEFAULT 'both';
  ALTER TABLE "tenants" ADD COLUMN "gamification_xp" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_streak" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_badges" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_celebrations" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_leaderboard" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "gamification_staff_goals" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_finance_inbox" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "gamification_weekly_goal_days" numeric DEFAULT 2;
  ALTER TABLE "tenants" ADD COLUMN "gamification_week_start" "enum_tenants_gamification_week_start" DEFAULT 'saturday';
  ALTER TABLE "tenants" ADD COLUMN "gamification_freeze_every_weeks" numeric DEFAULT 4;
  ALTER TABLE "tenants" ADD COLUMN "gamification_freeze_max" numeric DEFAULT 2;
  ALTER TABLE "tenants" ADD COLUMN "gamification_daily_xp_cap" numeric DEFAULT 150;
  ALTER TABLE "tenants" ADD COLUMN "gamification_completion_threshold_pct" numeric DEFAULT 90;
  ALTER TABLE "tenants" ADD COLUMN "gamification_leaderboard_size" numeric DEFAULT 5;
  ALTER TABLE "tenants" ADD COLUMN "gamification_leaderboard_minimum" numeric DEFAULT 8;
  ALTER TABLE "tenants" ADD COLUMN "gamification_team_weekly_goal" numeric;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_xp" numeric DEFAULT 0;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_level" numeric DEFAULT 1;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_streak_weeks" numeric DEFAULT 0;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_computed_at" timestamp(3) with time zone;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_summary" jsonb;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_leaderboard_opt_in" boolean DEFAULT false;
  ALTER TABLE "enrollments" ADD COLUMN "gamification_nickname" varchar;
  ALTER TABLE "enrollments" ADD COLUMN "lesson_watch" jsonb;
  ALTER TABLE "leads" ADD COLUMN "last_outcome" "enum_leads_last_outcome";
  ALTER TABLE "leads" ADD COLUMN "last_outcome_at" timestamp(3) with time zone;
  ALTER TABLE "leads" ADD COLUMN "last_outcome_by_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "learning_events_id" integer;
  ALTER TABLE "tenants_gamification_weekend_days" ADD CONSTRAINT "tenants_gamification_weekend_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_gamification_breaks" ADD CONSTRAINT "tenants_gamification_breaks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cohorts_breaks" ADD CONSTRAINT "cohorts_breaks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads_follow_ups" ADD CONSTRAINT "leads_follow_ups_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads_follow_ups" ADD CONSTRAINT "leads_follow_ups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_gamification_weekend_days_order_idx" ON "tenants_gamification_weekend_days" USING btree ("order");
  CREATE INDEX "tenants_gamification_weekend_days_parent_idx" ON "tenants_gamification_weekend_days" USING btree ("parent_id");
  CREATE INDEX "tenants_gamification_breaks_order_idx" ON "tenants_gamification_breaks" USING btree ("_order");
  CREATE INDEX "tenants_gamification_breaks_parent_id_idx" ON "tenants_gamification_breaks" USING btree ("_parent_id");
  CREATE INDEX "cohorts_breaks_order_idx" ON "cohorts_breaks" USING btree ("_order");
  CREATE INDEX "cohorts_breaks_parent_id_idx" ON "cohorts_breaks" USING btree ("_parent_id");
  CREATE INDEX "learning_events_tenant_idx" ON "learning_events" USING btree ("tenant_id");
  CREATE INDEX "learning_events_user_idx" ON "learning_events" USING btree ("user_id");
  CREATE INDEX "learning_events_enrollment_idx" ON "learning_events" USING btree ("enrollment_id");
  CREATE INDEX "learning_events_course_idx" ON "learning_events" USING btree ("course_id");
  CREATE INDEX "learning_events_cohort_idx" ON "learning_events" USING btree ("cohort_id");
  CREATE INDEX "learning_events_type_idx" ON "learning_events" USING btree ("type");
  CREATE INDEX "learning_events_source_id_idx" ON "learning_events" USING btree ("source_id");
  CREATE INDEX "learning_events_occurred_at_idx" ON "learning_events" USING btree ("occurred_at");
  CREATE INDEX "learning_events_reverses_idx" ON "learning_events" USING btree ("reverses");
  CREATE INDEX "learning_events_actor_idx" ON "learning_events" USING btree ("actor_id");
  CREATE INDEX "learning_events_updated_at_idx" ON "learning_events" USING btree ("updated_at");
  CREATE INDEX "learning_events_created_at_idx" ON "learning_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_idempotencyKey_idx" ON "learning_events" USING btree ("tenant_id","idempotency_key");
  CREATE INDEX "leads_follow_ups_order_idx" ON "leads_follow_ups" USING btree ("_order");
  CREATE INDEX "leads_follow_ups_parent_id_idx" ON "leads_follow_ups" USING btree ("_parent_id");
  CREATE INDEX "leads_follow_ups_by_idx" ON "leads_follow_ups" USING btree ("by_id");
  ALTER TABLE "leads" ADD CONSTRAINT "leads_last_outcome_by_id_users_id_fk" FOREIGN KEY ("last_outcome_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_learning_events_fk" FOREIGN KEY ("learning_events_id") REFERENCES "public"."learning_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "enrollments_gamification_gamification_xp_idx" ON "enrollments" USING btree ("gamification_xp");
  CREATE INDEX "leads_next_follow_up_at_idx" ON "leads" USING btree ("next_follow_up_at");
  CREATE INDEX "leads_last_outcome_by_idx" ON "leads" USING btree ("last_outcome_by_id");
  CREATE INDEX "payload_locked_documents_rels_learning_events_id_idx" ON "payload_locked_documents_rels" USING btree ("learning_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants_gamification_weekend_days" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tenants_gamification_breaks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cohorts_breaks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "learning_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "leads_follow_ups" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants_gamification_weekend_days" CASCADE;
  DROP TABLE "tenants_gamification_breaks" CASCADE;
  DROP TABLE "cohorts_breaks" CASCADE;
  DROP TABLE "learning_events" CASCADE;
  DROP TABLE "leads_follow_ups" CASCADE;
  ALTER TABLE "leads" DROP CONSTRAINT "leads_last_outcome_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_learning_events_fk";
  
  DROP INDEX "enrollments_gamification_gamification_xp_idx";
  DROP INDEX "leads_next_follow_up_at_idx";
  DROP INDEX "leads_last_outcome_by_idx";
  DROP INDEX "payload_locked_documents_rels_learning_events_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "gamification_enabled";
  ALTER TABLE "tenants" DROP COLUMN "gamification_audience";
  ALTER TABLE "tenants" DROP COLUMN "gamification_xp";
  ALTER TABLE "tenants" DROP COLUMN "gamification_streak";
  ALTER TABLE "tenants" DROP COLUMN "gamification_badges";
  ALTER TABLE "tenants" DROP COLUMN "gamification_celebrations";
  ALTER TABLE "tenants" DROP COLUMN "gamification_leaderboard";
  ALTER TABLE "tenants" DROP COLUMN "gamification_staff_goals";
  ALTER TABLE "tenants" DROP COLUMN "gamification_finance_inbox";
  ALTER TABLE "tenants" DROP COLUMN "gamification_weekly_goal_days";
  ALTER TABLE "tenants" DROP COLUMN "gamification_week_start";
  ALTER TABLE "tenants" DROP COLUMN "gamification_freeze_every_weeks";
  ALTER TABLE "tenants" DROP COLUMN "gamification_freeze_max";
  ALTER TABLE "tenants" DROP COLUMN "gamification_daily_xp_cap";
  ALTER TABLE "tenants" DROP COLUMN "gamification_completion_threshold_pct";
  ALTER TABLE "tenants" DROP COLUMN "gamification_leaderboard_size";
  ALTER TABLE "tenants" DROP COLUMN "gamification_leaderboard_minimum";
  ALTER TABLE "tenants" DROP COLUMN "gamification_team_weekly_goal";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_xp";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_level";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_streak_weeks";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_computed_at";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_summary";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_leaderboard_opt_in";
  ALTER TABLE "enrollments" DROP COLUMN "gamification_nickname";
  ALTER TABLE "enrollments" DROP COLUMN "lesson_watch";
  ALTER TABLE "leads" DROP COLUMN "last_outcome";
  ALTER TABLE "leads" DROP COLUMN "last_outcome_at";
  ALTER TABLE "leads" DROP COLUMN "last_outcome_by_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "learning_events_id";
  DROP TYPE "public"."enum_tenants_gamification_weekend_days";
  DROP TYPE "public"."enum_tenants_gamification_breaks_startsat_tz";
  DROP TYPE "public"."enum_tenants_gamification_breaks_endsat_tz";
  DROP TYPE "public"."enum_tenants_gamification_audience";
  DROP TYPE "public"."enum_tenants_gamification_week_start";
  DROP TYPE "public"."enum_cohorts_breaks_startsat_tz";
  DROP TYPE "public"."enum_cohorts_breaks_endsat_tz";
  DROP TYPE "public"."enum_learning_events_type";
  DROP TYPE "public"."enum_leads_follow_ups_outcome";
  DROP TYPE "public"."enum_leads_last_outcome";`)
}
