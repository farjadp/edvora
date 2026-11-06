import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TABLE "courses_pending_claims" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"note" varchar,
  	"source_url" varchar
  );
  
  CREATE TABLE "pages_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_pages_status" DEFAULT 'draft' NOT NULL,
  	"show_in_nav" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"intro" varchar,
  	"cover_id" integer,
  	"body" jsonb,
  	"source_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "contact_address" varchar;
  ALTER TABLE "courses" ADD COLUMN "source_url" varchar;
  ALTER TABLE "testimonials" ADD COLUMN "consent_note" varchar;
  ALTER TABLE "testimonials" ADD COLUMN "sort_order" numeric DEFAULT 0;
  ALTER TABLE "testimonials" ADD COLUMN "source_url" varchar;
  ALTER TABLE "posts" ADD COLUMN "source_url" varchar;
  ALTER TABLE "media" ADD COLUMN "source_url" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "courses_pending_claims" ADD CONSTRAINT "courses_pending_claims_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_faq" ADD CONSTRAINT "pages_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "courses_pending_claims_order_idx" ON "courses_pending_claims" USING btree ("_order");
  CREATE INDEX "courses_pending_claims_parent_id_idx" ON "courses_pending_claims" USING btree ("_parent_id");
  CREATE INDEX "pages_faq_order_idx" ON "pages_faq" USING btree ("_order");
  CREATE INDEX "pages_faq_parent_id_idx" ON "pages_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_tenant_idx" ON "pages" USING btree ("tenant_id");
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_cover_idx" ON "pages" USING btree ("cover_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses_pending_claims" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "courses_pending_claims" CASCADE;
  DROP TABLE "pages_faq" CASCADE;
  DROP TABLE "pages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "contact_address";
  ALTER TABLE "courses" DROP COLUMN "source_url";
  ALTER TABLE "testimonials" DROP COLUMN "consent_note";
  ALTER TABLE "testimonials" DROP COLUMN "sort_order";
  ALTER TABLE "testimonials" DROP COLUMN "source_url";
  ALTER TABLE "posts" DROP COLUMN "source_url";
  ALTER TABLE "media" DROP COLUMN "source_url";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  DROP TYPE "public"."enum_pages_status";`)
}
