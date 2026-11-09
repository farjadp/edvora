import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** E-015 advisor CRM desk: `leads.claim` permission key and `leads.lost_reason`. Grants follow in e015_claim_grant. */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_leads_lost_reason" AS ENUM('price', 'timing', 'chose_other', 'not_reachable', 'not_a_fit', 'other');
  ALTER TYPE "public"."enum_roles_permissions" ADD VALUE IF NOT EXISTS 'leads.claim' BEFORE 'leads.assign';
  ALTER TABLE "leads" ADD COLUMN "lost_reason" "enum_leads_lost_reason";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "roles_permissions" WHERE "value"::text = 'leads.claim';
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'quizzes.manage', 'assignments.manage', 'submissions.grade', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view', 'settings.integrations', 'payments.settings', 'import.view', 'import.run', 'ai.use', 'ai.manage');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";
  ALTER TABLE "leads" DROP COLUMN "lost_reason";
  DROP TYPE "public"."enum_leads_lost_reason";`)
}
