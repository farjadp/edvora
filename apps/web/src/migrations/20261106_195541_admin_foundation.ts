import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Data step (E-021). Frozen snapshot of the role templates at the time of this migration — do not import them from
 * @edvora/core, a later catalog change must not rewrite history. Idempotent: skips rows that already exist.
 */
const TEMPLATES: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: "academy-admin",
    name: "مدیر آکادمی",
    description: "Everything inside the academy except Edvora platform permissions.",
    permissions: ["users.view", "users.create", "users.edit", "users.deactivate", "users.view_sensitive", "users.import", "users.export", "roles.view", "roles.manage", "roles.assign", "courses.view", "courses.edit", "courses.publish", "cohorts.manage", "lessons.edit", "pricing.edit", "leads.view.own", "leads.view.all", "leads.create", "leads.assign", "leads.export", "orders.create_for_lead", "discount.give", "orders.view", "orders.edit", "payments.manual.record", "payments.manual.approve", "refunds.request", "refunds.approve", "coupons.manage", "finance.export", "enrollments.view", "enrollments.manage", "live.host", "assignments.grade", "qa.answer", "defense.score", "certificates.view", "certificates.issue", "certificates.revoke", "content.edit", "content.publish", "media.upload", "tickets.view.own", "tickets.view.all", "tickets.reply", "tickets.assign", "sms.send_single", "sms.broadcast", "templates.edit", "reports.sales", "reports.finance", "reports.learning", "settings.edit", "audit.view"],
  },
  {
    key: "advisor",
    name: "مشاور فروش",
    description: "Works own leads, creates orders and payment links, records manual payments.",
    permissions: ["leads.view.own", "leads.create", "orders.create_for_lead", "discount.give", "refunds.request", "payments.manual.record", "sms.send_single", "courses.view", "users.view", "enrollments.view"],
  },
  {
    key: "instructor",
    name: "مدرس",
    description: "Own courses and cohorts only \u2014 set the scope on the membership.",
    permissions: ["lessons.edit", "live.host", "assignments.grade", "qa.answer", "defense.score", "courses.view", "enrollments.view", "certificates.view"],
  },
  {
    key: "finance",
    name: "مالی",
    description: "Payments, instalments, manual receipts, refunds, exports.",
    permissions: ["orders.view", "orders.edit", "payments.manual.record", "payments.manual.approve", "refunds.request", "refunds.approve", "coupons.manage", "finance.export", "reports.finance", "users.view", "courses.view", "enrollments.view"],
  },
  {
    key: "support",
    name: "پشتیبانی",
    description: "Tickets and student lookup. No money actions.",
    permissions: ["tickets.view.own", "tickets.view.all", "tickets.reply", "tickets.assign", "users.view", "refunds.request", "sms.send_single", "courses.view", "enrollments.view", "certificates.view"],
  },
  {
    key: "content-editor",
    name: "اپراتور محتوا",
    description: "Website content and course text, no publishing of courses.",
    permissions: ["content.edit", "content.publish", "media.upload", "courses.view", "courses.edit"],
  },
  {
    key: "student",
    name: "دانشجو",
    description: "No admin permissions \u2014 student panel only.",
    permissions: [],
  },
]

/** Legacy global roles → template. company-manager has no template yet (B2B portal, later); student needs none. */
const LEGACY: Record<string, string> = { admin: 'academy-admin', advisor: 'advisor', instructor: 'instructor' }

type Row = Record<string, unknown>
const rowsOf = (res: unknown): Row[] => ((res as { rows?: Row[] }).rows ?? [])

async function backfill(db: MigrateUpArgs['db']): Promise<void> {
  const tenants = rowsOf(await db.execute(sql`SELECT id FROM tenants`))
  for (const tenant of tenants) {
    for (const t of TEMPLATES) {
      const found = rowsOf(await db.execute(sql`SELECT id FROM roles WHERE tenant_id = ${tenant.id} AND key = ${t.key} LIMIT 1`))
      if (found.length) continue
      const [role] = rowsOf(
        await db.execute(sql`INSERT INTO roles (tenant_id, name, key, description, template, archived)
          VALUES (${tenant.id}, ${t.name}, ${t.key}, ${t.description}, ${t.key}, false) RETURNING id`),
      )
      for (const [i, p] of t.permissions.entries()) {
        await db.execute(sql`INSERT INTO roles_permissions ("order", parent_id, value) VALUES (${i + 1}, ${role!.id}, ${p}::enum_roles_permissions)`)
      }
    }
  }

  const legacy = rowsOf(
    await db.execute(sql`SELECT ur.parent_id AS user_id, ur.value::text AS role, ut.tenant_id
      FROM users_roles ur JOIN users_tenants ut ON ut._parent_id = ur.parent_id
      WHERE ur.value::text IN ('admin', 'advisor', 'instructor')`),
  )
  for (const row of legacy) {
    const key = LEGACY[String(row.role)]
    if (!key) continue
    const [role] = rowsOf(await db.execute(sql`SELECT id FROM roles WHERE tenant_id = ${row.tenant_id} AND key = ${key} LIMIT 1`))
    if (!role) continue
    const exists = rowsOf(
      await db.execute(sql`SELECT 1 FROM memberships m JOIN memberships_rels mr ON mr.parent_id = m.id AND mr.path = 'roles'
        WHERE m.user_id = ${row.user_id} AND m.tenant_id = ${row.tenant_id} AND mr.roles_id = ${role.id} LIMIT 1`),
    )
    if (exists.length) continue
    const [membership] = rowsOf(
      await db.execute(sql`INSERT INTO memberships (tenant_id, user_id, status, note)
        VALUES (${row.tenant_id}, ${row.user_id}, 'active', ${`Migrated from legacy role "${String(row.role)}"`}) RETURNING id`),
    )
    await db.execute(sql`INSERT INTO memberships_rels ("order", parent_id, path, roles_id) VALUES (1, ${membership!.id}, 'roles', ${role.id})`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'suspended', 'archived');
  CREATE TYPE "public"."enum_users_source" AS ENUM('self-signup', 'lead', 'import', 'manual');
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view');
  CREATE TYPE "public"."enum_memberships_status" AS ENUM('active', 'suspended');
  CREATE TABLE "users_two_factor_verified_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sid" varchar NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "users_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "roles_permissions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_roles_permissions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "roles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"description" varchar,
  	"template" varchar,
  	"archived" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "memberships" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"user_id" integer NOT NULL,
  	"scope_own_records_only" boolean DEFAULT false,
  	"status" "enum_memberships_status" DEFAULT 'active' NOT NULL,
  	"expires_at" timestamp(3) with time zone,
  	"note" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "memberships_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer,
  	"courses_id" integer,
  	"cohorts_id" integer
  );
  
  CREATE TABLE "audit_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"actor_id" integer,
  	"actor_email" varchar,
  	"action" varchar NOT NULL,
  	"target_collection" varchar NOT NULL,
  	"doc_id" varchar NOT NULL,
  	"changes" jsonb,
  	"note" varchar,
  	"ip" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "first_name" varchar;
  ALTER TABLE "users" ADD COLUMN "last_name" varchar;
  ALTER TABLE "users" ADD COLUMN "first_name_latin" varchar;
  ALTER TABLE "users" ADD COLUMN "last_name_latin" varchar;
  ALTER TABLE "users" ADD COLUMN "national_code" varchar;
  ALTER TABLE "users" ADD COLUMN "birth_date" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "city" varchar;
  ALTER TABLE "users" ADD COLUMN "job_title" varchar;
  ALTER TABLE "users" ADD COLUMN "company" varchar;
  ALTER TABLE "users" ADD COLUMN "education" varchar;
  ALTER TABLE "users" ADD COLUMN "linkedin" varchar;
  ALTER TABLE "users" ADD COLUMN "public_profile_show_on_site" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "public_profile_title" varchar;
  ALTER TABLE "users" ADD COLUMN "public_profile_bio" varchar;
  ALTER TABLE "users" ADD COLUMN "status" "enum_users_status" DEFAULT 'active';
  ALTER TABLE "users" ADD COLUMN "status_reason" varchar;
  ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "two_factor_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "two_factor_pending_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "two_factor_last_used_step" numeric;
  ALTER TABLE "users" ADD COLUMN "two_factor_failed_attempts" numeric;
  ALTER TABLE "users" ADD COLUMN "two_factor_locked_until" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "source" "enum_users_source";
  ALTER TABLE "users" ADD COLUMN "internal_notes" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "memberships_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_logs_id" integer;
  ALTER TABLE "users_two_factor_verified_sessions" ADD CONSTRAINT "users_two_factor_verified_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_texts" ADD CONSTRAINT "users_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles_permissions" ADD CONSTRAINT "roles_permissions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memberships_rels" ADD CONSTRAINT "memberships_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_rels" ADD CONSTRAINT "memberships_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_rels" ADD CONSTRAINT "memberships_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_rels" ADD CONSTRAINT "memberships_rels_cohorts_fk" FOREIGN KEY ("cohorts_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_two_factor_verified_sessions_order_idx" ON "users_two_factor_verified_sessions" USING btree ("_order");
  CREATE INDEX "users_two_factor_verified_sessions_parent_id_idx" ON "users_two_factor_verified_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_texts_order_parent" ON "users_texts" USING btree ("order","parent_id");
  CREATE INDEX "roles_permissions_order_idx" ON "roles_permissions" USING btree ("order");
  CREATE INDEX "roles_permissions_parent_idx" ON "roles_permissions" USING btree ("parent_id");
  CREATE INDEX "roles_tenant_idx" ON "roles" USING btree ("tenant_id");
  CREATE INDEX "roles_key_idx" ON "roles" USING btree ("key");
  CREATE INDEX "roles_updated_at_idx" ON "roles" USING btree ("updated_at");
  CREATE INDEX "roles_created_at_idx" ON "roles" USING btree ("created_at");
  CREATE INDEX "memberships_tenant_idx" ON "memberships" USING btree ("tenant_id");
  CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");
  CREATE INDEX "memberships_created_by_idx" ON "memberships" USING btree ("created_by_id");
  CREATE INDEX "memberships_updated_at_idx" ON "memberships" USING btree ("updated_at");
  CREATE INDEX "memberships_created_at_idx" ON "memberships" USING btree ("created_at");
  CREATE INDEX "memberships_rels_order_idx" ON "memberships_rels" USING btree ("order");
  CREATE INDEX "memberships_rels_parent_idx" ON "memberships_rels" USING btree ("parent_id");
  CREATE INDEX "memberships_rels_path_idx" ON "memberships_rels" USING btree ("path");
  CREATE INDEX "memberships_rels_roles_id_idx" ON "memberships_rels" USING btree ("roles_id");
  CREATE INDEX "memberships_rels_courses_id_idx" ON "memberships_rels" USING btree ("courses_id");
  CREATE INDEX "memberships_rels_cohorts_id_idx" ON "memberships_rels" USING btree ("cohorts_id");
  CREATE INDEX "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");
  CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");
  CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");
  CREATE INDEX "audit_logs_target_collection_idx" ON "audit_logs" USING btree ("target_collection");
  CREATE INDEX "audit_logs_doc_id_idx" ON "audit_logs" USING btree ("doc_id");
  CREATE INDEX "audit_logs_updated_at_idx" ON "audit_logs" USING btree ("updated_at");
  CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_memberships_fk" FOREIGN KEY ("memberships_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_logs_fk" FOREIGN KEY ("audit_logs_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_status_idx" ON "users" USING btree ("status");
  CREATE INDEX "payload_locked_documents_rels_roles_id_idx" ON "payload_locked_documents_rels" USING btree ("roles_id");
  CREATE INDEX "payload_locked_documents_rels_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("memberships_id");
  CREATE INDEX "payload_locked_documents_rels_audit_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_logs_id");`)
  await backfill(db)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_two_factor_verified_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roles_permissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "memberships" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "memberships_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_two_factor_verified_sessions" CASCADE;
  DROP TABLE "users_texts" CASCADE;
  DROP TABLE "roles_permissions" CASCADE;
  DROP TABLE "roles" CASCADE;
  DROP TABLE "memberships" CASCADE;
  DROP TABLE "memberships_rels" CASCADE;
  DROP TABLE "audit_logs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_roles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_memberships_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_audit_logs_fk";
  
  DROP INDEX IF EXISTS "users_status_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_roles_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_memberships_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_audit_logs_id_idx";
  ALTER TABLE "users" DROP COLUMN "first_name";
  ALTER TABLE "users" DROP COLUMN "last_name";
  ALTER TABLE "users" DROP COLUMN "first_name_latin";
  ALTER TABLE "users" DROP COLUMN "last_name_latin";
  ALTER TABLE "users" DROP COLUMN "national_code";
  ALTER TABLE "users" DROP COLUMN "birth_date";
  ALTER TABLE "users" DROP COLUMN "city";
  ALTER TABLE "users" DROP COLUMN "job_title";
  ALTER TABLE "users" DROP COLUMN "company";
  ALTER TABLE "users" DROP COLUMN "education";
  ALTER TABLE "users" DROP COLUMN "linkedin";
  ALTER TABLE "users" DROP COLUMN "public_profile_show_on_site";
  ALTER TABLE "users" DROP COLUMN "public_profile_title";
  ALTER TABLE "users" DROP COLUMN "public_profile_bio";
  ALTER TABLE "users" DROP COLUMN "status";
  ALTER TABLE "users" DROP COLUMN "status_reason";
  ALTER TABLE "users" DROP COLUMN "two_factor_enabled";
  ALTER TABLE "users" DROP COLUMN "two_factor_secret";
  ALTER TABLE "users" DROP COLUMN "two_factor_pending_secret";
  ALTER TABLE "users" DROP COLUMN "two_factor_last_used_step";
  ALTER TABLE "users" DROP COLUMN "two_factor_failed_attempts";
  ALTER TABLE "users" DROP COLUMN "two_factor_locked_until";
  ALTER TABLE "users" DROP COLUMN "source";
  ALTER TABLE "users" DROP COLUMN "internal_notes";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "roles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "memberships_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_logs_id";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_users_source";
  DROP TYPE "public"."enum_roles_permissions";
  DROP TYPE "public"."enum_memberships_status";`)
}
