import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * E-046 (ADR 018): AI assistant collections, two permission keys, and the raw `ai_chunks` vector table.
 * `ai_chunks.embedding` is pgvector `vector` when the extension can be created here, else `double precision[]`
 * (the app then computes cosine in code). No serial id: Payload's dev push would try to drop an unknown sequence. The extension attempt runs in a savepoint so a host without pgvector
 * does not abort the migration.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_settings_provider" AS ENUM('openai', 'anthropic', 'gemini', 'custom', 'mock');
  CREATE TYPE "public"."enum_ai_messages_role" AS ENUM('user', 'assistant');
  CREATE TYPE "public"."enum_ai_documents_status" AS ENUM('processing', 'ready', 'failed');
  CREATE TYPE "public"."enum_ai_memories_status" AS ENUM('proposed', 'approved', 'rejected');
  CREATE TYPE "public"."enum_ai_actions_status" AS ENUM('pending', 'executed', 'rejected', 'failed', 'expired');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE IF NOT EXISTS 'ai.use';
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE IF NOT EXISTS 'ai.manage';
  CREATE TABLE "ai_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"enabled" boolean DEFAULT false,
  	"provider" "enum_ai_settings_provider" DEFAULT 'mock' NOT NULL,
  	"model" varchar DEFAULT 'mock-1' NOT NULL,
  	"base_url" varchar,
  	"api_key_sealed" varchar,
  	"api_key_hint" varchar,
  	"embedding_model" varchar,
  	"privacy_names" boolean DEFAULT true,
  	"privacy_national_codes" boolean DEFAULT false,
  	"privacy_phones" boolean DEFAULT false,
  	"privacy_emails" boolean DEFAULT false,
  	"limits_per_minute" numeric DEFAULT 20,
  	"limits_per_day" numeric DEFAULT 300,
  	"limits_monthly_token_limit" numeric,
  	"limits_monthly_cost_limit_rial" numeric,
  	"limits_input_price_per_million_rial" numeric,
  	"limits_output_price_per_million_rial" numeric,
  	"last_test" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"user_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"page_path" varchar,
  	"last_message_at" timestamp(3) with time zone,
  	"message_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"conversation_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"role" "enum_ai_messages_role" NOT NULL,
  	"content" varchar,
  	"citations" jsonb,
  	"tools" jsonb,
  	"input_tokens" numeric DEFAULT 0,
  	"output_tokens" numeric DEFAULT 0,
  	"provider" varchar,
  	"model" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_messages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"ai_actions_id" integer
  );
  
  CREATE TABLE "ai_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"filename" varchar NOT NULL,
  	"mime_type" varchar,
  	"size" numeric,
  	"status" "enum_ai_documents_status" DEFAULT 'processing' NOT NULL,
  	"error" varchar,
  	"chunk_count" numeric DEFAULT 0,
  	"characters" numeric DEFAULT 0,
  	"embedding_model" varchar,
  	"uploaded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_memories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"text" varchar NOT NULL,
  	"status" "enum_ai_memories_status" DEFAULT 'proposed' NOT NULL,
  	"proposed_by_id" integer,
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"conversation_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_actions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"kind" varchar NOT NULL,
  	"input" jsonb NOT NULL,
  	"summary" varchar NOT NULL,
  	"status" "enum_ai_actions_status" DEFAULT 'pending' NOT NULL,
  	"proposed_by_id" integer NOT NULL,
  	"conversation_id" integer,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"decided_at" timestamp(3) with time zone,
  	"target_collection" varchar,
  	"target_id" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_conversations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_messages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_documents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_memories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_actions_id" integer;
  ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_messages_rels" ADD CONSTRAINT "ai_messages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_messages_rels" ADD CONSTRAINT "ai_messages_rels_ai_actions_fk" FOREIGN KEY ("ai_actions_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_documents" ADD CONSTRAINT "ai_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_documents" ADD CONSTRAINT "ai_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_proposed_by_id_users_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_proposed_by_id_users_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_settings_tenant_idx" ON "ai_settings" USING btree ("tenant_id");
  CREATE INDEX "ai_settings_updated_at_idx" ON "ai_settings" USING btree ("updated_at");
  CREATE INDEX "ai_settings_created_at_idx" ON "ai_settings" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_idx" ON "ai_settings" USING btree ("tenant_id");
  CREATE INDEX "ai_conversations_tenant_idx" ON "ai_conversations" USING btree ("tenant_id");
  CREATE INDEX "ai_conversations_user_idx" ON "ai_conversations" USING btree ("user_id");
  CREATE INDEX "ai_conversations_last_message_at_idx" ON "ai_conversations" USING btree ("last_message_at");
  CREATE INDEX "ai_conversations_updated_at_idx" ON "ai_conversations" USING btree ("updated_at");
  CREATE INDEX "ai_conversations_created_at_idx" ON "ai_conversations" USING btree ("created_at");
  CREATE INDEX "ai_messages_tenant_idx" ON "ai_messages" USING btree ("tenant_id");
  CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id");
  CREATE INDEX "ai_messages_user_idx" ON "ai_messages" USING btree ("user_id");
  CREATE INDEX "ai_messages_updated_at_idx" ON "ai_messages" USING btree ("updated_at");
  CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages" USING btree ("created_at");
  CREATE INDEX "ai_messages_rels_order_idx" ON "ai_messages_rels" USING btree ("order");
  CREATE INDEX "ai_messages_rels_parent_idx" ON "ai_messages_rels" USING btree ("parent_id");
  CREATE INDEX "ai_messages_rels_path_idx" ON "ai_messages_rels" USING btree ("path");
  CREATE INDEX "ai_messages_rels_ai_actions_id_idx" ON "ai_messages_rels" USING btree ("ai_actions_id");
  CREATE INDEX "ai_documents_tenant_idx" ON "ai_documents" USING btree ("tenant_id");
  CREATE INDEX "ai_documents_uploaded_by_idx" ON "ai_documents" USING btree ("uploaded_by_id");
  CREATE INDEX "ai_documents_updated_at_idx" ON "ai_documents" USING btree ("updated_at");
  CREATE INDEX "ai_documents_created_at_idx" ON "ai_documents" USING btree ("created_at");
  CREATE INDEX "ai_memories_tenant_idx" ON "ai_memories" USING btree ("tenant_id");
  CREATE INDEX "ai_memories_status_idx" ON "ai_memories" USING btree ("status");
  CREATE INDEX "ai_memories_proposed_by_idx" ON "ai_memories" USING btree ("proposed_by_id");
  CREATE INDEX "ai_memories_decided_by_idx" ON "ai_memories" USING btree ("decided_by_id");
  CREATE INDEX "ai_memories_conversation_idx" ON "ai_memories" USING btree ("conversation_id");
  CREATE INDEX "ai_memories_updated_at_idx" ON "ai_memories" USING btree ("updated_at");
  CREATE INDEX "ai_memories_created_at_idx" ON "ai_memories" USING btree ("created_at");
  CREATE INDEX "ai_actions_tenant_idx" ON "ai_actions" USING btree ("tenant_id");
  CREATE INDEX "ai_actions_kind_idx" ON "ai_actions" USING btree ("kind");
  CREATE INDEX "ai_actions_status_idx" ON "ai_actions" USING btree ("status");
  CREATE INDEX "ai_actions_proposed_by_idx" ON "ai_actions" USING btree ("proposed_by_id");
  CREATE INDEX "ai_actions_conversation_idx" ON "ai_actions" USING btree ("conversation_id");
  CREATE INDEX "ai_actions_updated_at_idx" ON "ai_actions" USING btree ("updated_at");
  CREATE INDEX "ai_actions_created_at_idx" ON "ai_actions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_settings_fk" FOREIGN KEY ("ai_settings_id") REFERENCES "public"."ai_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_conversations_fk" FOREIGN KEY ("ai_conversations_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_messages_fk" FOREIGN KEY ("ai_messages_id") REFERENCES "public"."ai_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_documents_fk" FOREIGN KEY ("ai_documents_id") REFERENCES "public"."ai_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_memories_fk" FOREIGN KEY ("ai_memories_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_actions_fk" FOREIGN KEY ("ai_actions_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_settings_id");
  CREATE INDEX "payload_locked_documents_rels_ai_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_conversations_id");
  CREATE INDEX "payload_locked_documents_rels_ai_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_messages_id");
  CREATE INDEX "payload_locked_documents_rels_ai_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_documents_id");
  CREATE INDEX "payload_locked_documents_rels_ai_memories_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_memories_id");
  CREATE INDEX "payload_locked_documents_rels_ai_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_actions_id");`)

  let vector = false
  const available = await db.execute(sql`SELECT 1 FROM pg_available_extensions WHERE name = 'vector'`)
  if (available.rows.length > 0) {
    await db.execute(sql`SAVEPOINT ai_vector`)
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`)
      await db.execute(sql`RELEASE SAVEPOINT ai_vector`)
      vector = true
    } catch (err) {
      await db.execute(sql`ROLLBACK TO SAVEPOINT ai_vector`)
      payload.logger.warn({ err, msg: 'ai: pgvector could not be created; ai_chunks uses double precision[]' })
    }
  }
  // Frozen copy of lib/ai/chunks.ts CHUNKS_DDL at the time of this migration.
  await db.execute(
    sql.raw(`
  CREATE TABLE IF NOT EXISTS ai_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type varchar(16) NOT NULL,
    source_id integer NOT NULL,
    owner_id integer,
    title text NOT NULL,
    ordinal integer NOT NULL DEFAULT 0,
    content text NOT NULL,
    embedding_model varchar(80) NOT NULL,
    embedding ${vector ? 'vector' : 'double precision[]'} NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ai_chunks_lookup_idx ON ai_chunks (tenant_id, embedding_model, source_type);
  CREATE INDEX IF NOT EXISTS ai_chunks_source_idx ON ai_chunks (source_type, source_id);`),
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "ai_chunks"`)
  await db.execute(sql`
  DELETE FROM "roles_permissions" WHERE "value" IN ('ai.use', 'ai.manage');
   ALTER TABLE "ai_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_conversations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_messages_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_memories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_actions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_settings" CASCADE;
  DROP TABLE "ai_conversations" CASCADE;
  DROP TABLE "ai_messages" CASCADE;
  DROP TABLE "ai_messages_rels" CASCADE;
  DROP TABLE "ai_documents" CASCADE;
  DROP TABLE "ai_memories" CASCADE;
  DROP TABLE "ai_actions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_settings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_conversations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_documents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_memories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_actions_fk";
  
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'import.view', 'import.run');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  DROP INDEX "payload_locked_documents_rels_ai_settings_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_conversations_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_documents_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_memories_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_actions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_settings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_conversations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_memories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_actions_id";
  DROP TYPE "public"."enum_ai_settings_provider";
  DROP TYPE "public"."enum_ai_messages_role";
  DROP TYPE "public"."enum_ai_documents_status";
  DROP TYPE "public"."enum_ai_memories_status";
  DROP TYPE "public"."enum_ai_actions_status";`)
}
