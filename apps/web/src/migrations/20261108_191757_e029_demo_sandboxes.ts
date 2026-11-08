import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_demo_sandboxes_status" AS ENUM('creating', 'active', 'failed', 'purged');
  CREATE TYPE "public"."enum_demo_leads_source" AS ENUM('demo-form', 'full-state', 'expired-state', 'talk');
  CREATE TABLE "demo_sandboxes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"tenant_slug" varchar,
  	"status" "enum_demo_sandboxes_status" DEFAULT 'creating' NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"purged_at" timestamp(3) with time zone,
  	"ip_hash" varchar NOT NULL,
  	"creator_key_hash" varchar,
  	"pow_nonce" varchar,
  	"build_ms" numeric,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "demo_leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"email" varchar NOT NULL,
  	"consent" boolean DEFAULT false NOT NULL,
  	"consent_text" varchar NOT NULL,
  	"sandbox_id" integer,
  	"source" "enum_demo_leads_source" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "is_sandbox" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "expires_at" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "purge_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "sandbox_tenant_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "demo_sandboxes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "demo_leads_id" integer;
  ALTER TABLE "demo_sandboxes" ADD CONSTRAINT "demo_sandboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "demo_leads" ADD CONSTRAINT "demo_leads_sandbox_id_demo_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."demo_sandboxes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "demo_sandboxes_tenant_idx" ON "demo_sandboxes" USING btree ("tenant_id");
  CREATE INDEX "demo_sandboxes_tenant_slug_idx" ON "demo_sandboxes" USING btree ("tenant_slug");
  CREATE INDEX "demo_sandboxes_status_idx" ON "demo_sandboxes" USING btree ("status");
  CREATE INDEX "demo_sandboxes_expires_at_idx" ON "demo_sandboxes" USING btree ("expires_at");
  CREATE INDEX "demo_sandboxes_ip_hash_idx" ON "demo_sandboxes" USING btree ("ip_hash");
  CREATE INDEX "demo_sandboxes_creator_key_hash_idx" ON "demo_sandboxes" USING btree ("creator_key_hash");
  CREATE UNIQUE INDEX "demo_sandboxes_pow_nonce_idx" ON "demo_sandboxes" USING btree ("pow_nonce");
  CREATE INDEX "demo_sandboxes_updated_at_idx" ON "demo_sandboxes" USING btree ("updated_at");
  CREATE INDEX "demo_sandboxes_created_at_idx" ON "demo_sandboxes" USING btree ("created_at");
  CREATE INDEX "demo_leads_email_idx" ON "demo_leads" USING btree ("email");
  CREATE INDEX "demo_leads_sandbox_idx" ON "demo_leads" USING btree ("sandbox_id");
  CREATE INDEX "demo_leads_updated_at_idx" ON "demo_leads" USING btree ("updated_at");
  CREATE INDEX "demo_leads_created_at_idx" ON "demo_leads" USING btree ("created_at");
  ALTER TABLE "users" ADD CONSTRAINT "users_sandbox_tenant_id_tenants_id_fk" FOREIGN KEY ("sandbox_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_demo_sandboxes_fk" FOREIGN KEY ("demo_sandboxes_id") REFERENCES "public"."demo_sandboxes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_demo_leads_fk" FOREIGN KEY ("demo_leads_id") REFERENCES "public"."demo_leads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_is_sandbox_idx" ON "tenants" USING btree ("is_sandbox");
  CREATE INDEX "tenants_expires_at_idx" ON "tenants" USING btree ("expires_at");
  CREATE INDEX "tenants_purge_at_idx" ON "tenants" USING btree ("purge_at");
  CREATE INDEX "users_sandbox_tenant_idx" ON "users" USING btree ("sandbox_tenant_id");
  CREATE INDEX "payload_locked_documents_rels_demo_sandboxes_id_idx" ON "payload_locked_documents_rels" USING btree ("demo_sandboxes_id");
  CREATE INDEX "payload_locked_documents_rels_demo_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("demo_leads_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "demo_sandboxes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "demo_leads" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "demo_sandboxes" CASCADE;
  DROP TABLE "demo_leads" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT "users_sandbox_tenant_id_tenants_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_demo_sandboxes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_demo_leads_fk";
  
  DROP INDEX "tenants_is_sandbox_idx";
  DROP INDEX "tenants_expires_at_idx";
  DROP INDEX "tenants_purge_at_idx";
  DROP INDEX "users_sandbox_tenant_idx";
  DROP INDEX "payload_locked_documents_rels_demo_sandboxes_id_idx";
  DROP INDEX "payload_locked_documents_rels_demo_leads_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "is_sandbox";
  ALTER TABLE "tenants" DROP COLUMN "expires_at";
  ALTER TABLE "tenants" DROP COLUMN "purge_at";
  ALTER TABLE "users" DROP COLUMN "sandbox_tenant_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "demo_sandboxes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "demo_leads_id";
  DROP TYPE "public"."enum_demo_sandboxes_status";
  DROP TYPE "public"."enum_demo_leads_source";`)
}
