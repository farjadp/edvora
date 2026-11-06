import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_drip_mode" AS ENUM('none', 'fixedDate', 'afterEnrollment', 'afterCohortStart', 'afterPrevious');
  CREATE TYPE "public"."enum_lessons_drip_releaseat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_questions_type" AS ENUM('single', 'multiple', 'trueFalse', 'short');
  CREATE TYPE "public"."enum_questions_correct_answer" AS ENUM('true', 'false');
  CREATE TYPE "public"."enum_quizzes_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum_quizzes_counted_attempt" AS ENUM('best', 'last');
  CREATE TYPE "public"."enum_quizzes_review" AS ENUM('none', 'score', 'wrongRight', 'full');
  CREATE TYPE "public"."enum_quizzes_full_review_when" AS ENUM('always', 'afterPass', 'afterLastAttempt');
  CREATE TYPE "public"."enum_quiz_attempts_status" AS ENUM('in_progress', 'submitted', 'auto_submitted');
  CREATE TYPE "public"."enum_assignments_dueat_tz" AS ENUM('Asia/Tehran');
  CREATE TYPE "public"."enum_assignments_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum_submissions_status" AS ENUM('submitted', 'graded', 'missing');
  CREATE TYPE "public"."enum_submission_files_kind" AS ENUM('pdf', 'docx', 'jpg', 'png');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'quizzes.manage' BEFORE 'certificates.view';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'assignments.manage' BEFORE 'certificates.view';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'submissions.grade' BEFORE 'certificates.view';
  CREATE TABLE "enrollments_quiz_extra_attempts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quiz_id" integer NOT NULL,
  	"extra" numeric DEFAULT 1 NOT NULL
  );
  
  CREATE TABLE "questions_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"is_correct" boolean
  );
  
  CREATE TABLE "questions_accepted_answers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"answer" varchar
  );
  
  CREATE TABLE "questions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"course_id" integer NOT NULL,
  	"type" "enum_questions_type" DEFAULT 'single' NOT NULL,
  	"points" numeric DEFAULT 1 NOT NULL,
  	"text" varchar NOT NULL,
  	"correct_answer" "enum_questions_correct_answer",
  	"explanation" varchar,
  	"archived" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quizzes_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question_id" integer NOT NULL,
  	"points" numeric
  );
  
  CREATE TABLE "quizzes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"course_id" integer NOT NULL,
  	"lesson_id" integer,
  	"status" "enum_quizzes_status" DEFAULT 'draft' NOT NULL,
  	"description" varchar,
  	"required" boolean DEFAULT false,
  	"pass_mark" numeric NOT NULL,
  	"attempts_limit" numeric,
  	"time_limit_min" numeric,
  	"counted_attempt" "enum_quizzes_counted_attempt" DEFAULT 'best',
  	"review" "enum_quizzes_review" DEFAULT 'wrongRight',
  	"full_review_when" "enum_quizzes_full_review_when" DEFAULT 'always',
  	"partial_credit" boolean DEFAULT false,
  	"allow_retake_after_pass" boolean DEFAULT false,
  	"shuffle" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quiz_attempts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"quiz_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"attempt_no" numeric NOT NULL,
  	"enrollment_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"status" "enum_quiz_attempts_status" DEFAULT 'in_progress' NOT NULL,
  	"score" numeric,
  	"max_score" numeric,
  	"passed" boolean DEFAULT false,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"deadline_at" timestamp(3) with time zone,
  	"submitted_at" timestamp(3) with time zone,
  	"answers" jsonb,
  	"snapshot" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "assignments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"lesson_id" integer,
  	"description" varchar,
  	"due_at" timestamp(3) with time zone NOT NULL,
  	"dueat_tz" "enum_assignments_dueat_tz" DEFAULT 'Asia/Tehran' NOT NULL,
  	"max_score" numeric DEFAULT 20 NOT NULL,
  	"pass_score" numeric,
  	"required" boolean DEFAULT false,
  	"allow_late" boolean DEFAULT false,
  	"status" "enum_assignments_status" DEFAULT 'published' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "assignments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"assignment_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"enrollment_id" integer,
  	"course_id" integer,
  	"cohort_id" integer,
  	"status" "enum_submissions_status" DEFAULT 'submitted',
  	"late" boolean DEFAULT false,
  	"submitted_at" timestamp(3) with time zone,
  	"text" varchar,
  	"score_input" varchar,
  	"score" numeric,
  	"feedback" varchar,
  	"graded_by_id" integer,
  	"graded_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "submissions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"submission_files_id" integer
  );
  
  CREATE TABLE "submission_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"owner_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"cohort_id" integer,
  	"kind" "enum_submission_files_kind" NOT NULL,
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
  
  ALTER TABLE "lessons" ADD COLUMN "drip_mode" "enum_lessons_drip_mode" DEFAULT 'none';
  ALTER TABLE "lessons" ADD COLUMN "drip_days" numeric;
  ALTER TABLE "lessons" ADD COLUMN "drip_release_at" timestamp(3) with time zone;
  ALTER TABLE "lessons" ADD COLUMN "drip_releaseat_tz" "enum_lessons_drip_releaseat_tz" DEFAULT 'Asia/Tehran';
  ALTER TABLE "enrollments" ADD COLUMN "enrolled_at" timestamp(3) with time zone;
  -- R: drip counts from enrolled_at; existing enrollments start from when they were created.
  UPDATE "enrollments" SET "enrolled_at" = "created_at" WHERE "enrolled_at" IS NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "questions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quizzes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quiz_attempts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "assignments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submissions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submission_files_id" integer;
  ALTER TABLE "enrollments_quiz_extra_attempts" ADD CONSTRAINT "enrollments_quiz_extra_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments_quiz_extra_attempts" ADD CONSTRAINT "enrollments_quiz_extra_attempts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_options" ADD CONSTRAINT "questions_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_accepted_answers" ADD CONSTRAINT "questions_accepted_answers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "questions" ADD CONSTRAINT "questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quizzes_questions" ADD CONSTRAINT "quizzes_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quizzes_questions" ADD CONSTRAINT "quizzes_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "assignments_rels" ADD CONSTRAINT "assignments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "assignments_rels" ADD CONSTRAINT "assignments_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_graded_by_id_users_id_fk" FOREIGN KEY ("graded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions_rels" ADD CONSTRAINT "submissions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "submissions_rels" ADD CONSTRAINT "submissions_rels_submission_files_fk" FOREIGN KEY ("submission_files_id") REFERENCES "public"."submission_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "enrollments_quiz_extra_attempts_order_idx" ON "enrollments_quiz_extra_attempts" USING btree ("_order");
  CREATE INDEX "enrollments_quiz_extra_attempts_parent_id_idx" ON "enrollments_quiz_extra_attempts" USING btree ("_parent_id");
  CREATE INDEX "enrollments_quiz_extra_attempts_quiz_idx" ON "enrollments_quiz_extra_attempts" USING btree ("quiz_id");
  CREATE INDEX "questions_options_order_idx" ON "questions_options" USING btree ("_order");
  CREATE INDEX "questions_options_parent_id_idx" ON "questions_options" USING btree ("_parent_id");
  CREATE INDEX "questions_accepted_answers_order_idx" ON "questions_accepted_answers" USING btree ("_order");
  CREATE INDEX "questions_accepted_answers_parent_id_idx" ON "questions_accepted_answers" USING btree ("_parent_id");
  CREATE INDEX "questions_tenant_idx" ON "questions" USING btree ("tenant_id");
  CREATE INDEX "questions_course_idx" ON "questions" USING btree ("course_id");
  CREATE INDEX "questions_archived_idx" ON "questions" USING btree ("archived");
  CREATE INDEX "questions_updated_at_idx" ON "questions" USING btree ("updated_at");
  CREATE INDEX "questions_created_at_idx" ON "questions" USING btree ("created_at");
  CREATE INDEX "quizzes_questions_order_idx" ON "quizzes_questions" USING btree ("_order");
  CREATE INDEX "quizzes_questions_parent_id_idx" ON "quizzes_questions" USING btree ("_parent_id");
  CREATE INDEX "quizzes_questions_question_idx" ON "quizzes_questions" USING btree ("question_id");
  CREATE INDEX "quizzes_tenant_idx" ON "quizzes" USING btree ("tenant_id");
  CREATE INDEX "quizzes_course_idx" ON "quizzes" USING btree ("course_id");
  CREATE INDEX "quizzes_lesson_idx" ON "quizzes" USING btree ("lesson_id");
  CREATE INDEX "quizzes_status_idx" ON "quizzes" USING btree ("status");
  CREATE INDEX "quizzes_updated_at_idx" ON "quizzes" USING btree ("updated_at");
  CREATE INDEX "quizzes_created_at_idx" ON "quizzes" USING btree ("created_at");
  CREATE INDEX "quiz_attempts_tenant_idx" ON "quiz_attempts" USING btree ("tenant_id");
  CREATE INDEX "quiz_attempts_quiz_idx" ON "quiz_attempts" USING btree ("quiz_id");
  CREATE INDEX "quiz_attempts_user_idx" ON "quiz_attempts" USING btree ("user_id");
  CREATE INDEX "quiz_attempts_enrollment_idx" ON "quiz_attempts" USING btree ("enrollment_id");
  CREATE INDEX "quiz_attempts_course_idx" ON "quiz_attempts" USING btree ("course_id");
  CREATE INDEX "quiz_attempts_cohort_idx" ON "quiz_attempts" USING btree ("cohort_id");
  CREATE INDEX "quiz_attempts_status_idx" ON "quiz_attempts" USING btree ("status");
  CREATE INDEX "quiz_attempts_updated_at_idx" ON "quiz_attempts" USING btree ("updated_at");
  CREATE INDEX "quiz_attempts_created_at_idx" ON "quiz_attempts" USING btree ("created_at");
  CREATE UNIQUE INDEX "quiz_user_attemptNo_idx" ON "quiz_attempts" USING btree ("quiz_id","user_id","attempt_no");
  CREATE INDEX "assignments_tenant_idx" ON "assignments" USING btree ("tenant_id");
  CREATE INDEX "assignments_course_idx" ON "assignments" USING btree ("course_id");
  CREATE INDEX "assignments_cohort_idx" ON "assignments" USING btree ("cohort_id");
  CREATE INDEX "assignments_lesson_idx" ON "assignments" USING btree ("lesson_id");
  CREATE INDEX "assignments_status_idx" ON "assignments" USING btree ("status");
  CREATE INDEX "assignments_updated_at_idx" ON "assignments" USING btree ("updated_at");
  CREATE INDEX "assignments_created_at_idx" ON "assignments" USING btree ("created_at");
  CREATE INDEX "assignments_rels_order_idx" ON "assignments_rels" USING btree ("order");
  CREATE INDEX "assignments_rels_parent_idx" ON "assignments_rels" USING btree ("parent_id");
  CREATE INDEX "assignments_rels_path_idx" ON "assignments_rels" USING btree ("path");
  CREATE INDEX "assignments_rels_media_id_idx" ON "assignments_rels" USING btree ("media_id");
  CREATE INDEX "submissions_tenant_idx" ON "submissions" USING btree ("tenant_id");
  CREATE INDEX "submissions_assignment_idx" ON "submissions" USING btree ("assignment_id");
  CREATE INDEX "submissions_user_idx" ON "submissions" USING btree ("user_id");
  CREATE INDEX "submissions_enrollment_idx" ON "submissions" USING btree ("enrollment_id");
  CREATE INDEX "submissions_course_idx" ON "submissions" USING btree ("course_id");
  CREATE INDEX "submissions_cohort_idx" ON "submissions" USING btree ("cohort_id");
  CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");
  CREATE INDEX "submissions_late_idx" ON "submissions" USING btree ("late");
  CREATE INDEX "submissions_submitted_at_idx" ON "submissions" USING btree ("submitted_at");
  CREATE INDEX "submissions_graded_by_idx" ON "submissions" USING btree ("graded_by_id");
  CREATE INDEX "submissions_updated_at_idx" ON "submissions" USING btree ("updated_at");
  CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");
  CREATE UNIQUE INDEX "assignment_user_idx" ON "submissions" USING btree ("assignment_id","user_id");
  CREATE INDEX "submissions_rels_order_idx" ON "submissions_rels" USING btree ("order");
  CREATE INDEX "submissions_rels_parent_idx" ON "submissions_rels" USING btree ("parent_id");
  CREATE INDEX "submissions_rels_path_idx" ON "submissions_rels" USING btree ("path");
  CREATE INDEX "submissions_rels_submission_files_id_idx" ON "submissions_rels" USING btree ("submission_files_id");
  CREATE INDEX "submission_files_tenant_idx" ON "submission_files" USING btree ("tenant_id");
  CREATE INDEX "submission_files_owner_idx" ON "submission_files" USING btree ("owner_id");
  CREATE INDEX "submission_files_course_idx" ON "submission_files" USING btree ("course_id");
  CREATE INDEX "submission_files_cohort_idx" ON "submission_files" USING btree ("cohort_id");
  CREATE INDEX "submission_files_updated_at_idx" ON "submission_files" USING btree ("updated_at");
  CREATE INDEX "submission_files_created_at_idx" ON "submission_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "submission_files_filename_idx" ON "submission_files" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quizzes_fk" FOREIGN KEY ("quizzes_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quiz_attempts_fk" FOREIGN KEY ("quiz_attempts_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_assignments_fk" FOREIGN KEY ("assignments_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submissions_fk" FOREIGN KEY ("submissions_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submission_files_fk" FOREIGN KEY ("submission_files_id") REFERENCES "public"."submission_files"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "enrollments_enrolled_at_idx" ON "enrollments" USING btree ("enrolled_at");
  CREATE INDEX "payload_locked_documents_rels_questions_id_idx" ON "payload_locked_documents_rels" USING btree ("questions_id");
  CREATE INDEX "payload_locked_documents_rels_quizzes_id_idx" ON "payload_locked_documents_rels" USING btree ("quizzes_id");
  CREATE INDEX "payload_locked_documents_rels_quiz_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("quiz_attempts_id");
  CREATE INDEX "payload_locked_documents_rels_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("assignments_id");
  CREATE INDEX "payload_locked_documents_rels_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("submissions_id");
  CREATE INDEX "payload_locked_documents_rels_submission_files_id_idx" ON "payload_locked_documents_rels" USING btree ("submission_files_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "enrollments_quiz_extra_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions_accepted_answers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quizzes_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quizzes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quiz_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assignments_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submissions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submission_files" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "enrollments_quiz_extra_attempts" CASCADE;
  DROP TABLE "questions_options" CASCADE;
  DROP TABLE "questions_accepted_answers" CASCADE;
  DROP TABLE "questions" CASCADE;
  DROP TABLE "quizzes_questions" CASCADE;
  DROP TABLE "quizzes" CASCADE;
  DROP TABLE "quiz_attempts" CASCADE;
  DROP TABLE "assignments" CASCADE;
  DROP TABLE "assignments_rels" CASCADE;
  DROP TABLE "submissions" CASCADE;
  DROP TABLE "submissions_rels" CASCADE;
  DROP TABLE "submission_files" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_questions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quizzes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quiz_attempts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_assignments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_submissions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_submission_files_fk";
  
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "enrollments_enrolled_at_idx";
  DROP INDEX "payload_locked_documents_rels_questions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quizzes_id_idx";
  DROP INDEX "payload_locked_documents_rels_quiz_attempts_id_idx";
  DROP INDEX "payload_locked_documents_rels_assignments_id_idx";
  DROP INDEX "payload_locked_documents_rels_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_submission_files_id_idx";
  ALTER TABLE "lessons" DROP COLUMN "drip_mode";
  ALTER TABLE "lessons" DROP COLUMN "drip_days";
  ALTER TABLE "lessons" DROP COLUMN "drip_release_at";
  ALTER TABLE "lessons" DROP COLUMN "drip_releaseat_tz";
  ALTER TABLE "enrollments" DROP COLUMN "enrolled_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "questions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quizzes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quiz_attempts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "assignments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "submission_files_id";
  DROP TYPE "public"."enum_lessons_drip_mode";
  DROP TYPE "public"."enum_lessons_drip_releaseat_tz";
  DROP TYPE "public"."enum_questions_type";
  DROP TYPE "public"."enum_questions_correct_answer";
  DROP TYPE "public"."enum_quizzes_status";
  DROP TYPE "public"."enum_quizzes_counted_attempt";
  DROP TYPE "public"."enum_quizzes_review";
  DROP TYPE "public"."enum_quizzes_full_review_when";
  DROP TYPE "public"."enum_quiz_attempts_status";
  DROP TYPE "public"."enum_assignments_dueat_tz";
  DROP TYPE "public"."enum_assignments_status";
  DROP TYPE "public"."enum_submissions_status";
  DROP TYPE "public"."enum_submission_files_kind";`)
}
