import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** E-022: new permission key `users.2fa.reset`. Schema only; templates get it from `pnpm seed` / new-academy sync. */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_roles_permissions" ADD VALUE 'users.2fa.reset' BEFORE 'roles.view';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rolling back removes the key from every role first (the enum cannot drop a value that is in use).
  await db.execute(sql`
   DELETE FROM "roles_permissions" WHERE "value" = 'users.2fa.reset';
   ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_roles_permissions";
  CREATE TYPE "public"."enum_roles_permissions" AS ENUM('users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'roles.view', 'roles.manage', 'roles.assign', 'courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit', 'leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give', 'orders.view', 'orders.edit', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve', 'coupons.manage', 'finance.export', 'enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'certificates.view', 'certificates.issue', 'certificates.revoke', 'content.edit', 'content.publish', 'media.upload', 'tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign', 'sms.send_single', 'sms.broadcast', 'templates.edit', 'reports.sales', 'reports.finance', 'reports.learning', 'settings.edit', 'audit.view');
  ALTER TABLE "roles_permissions" ALTER COLUMN "value" SET DATA TYPE "public"."enum_roles_permissions" USING "value"::"public"."enum_roles_permissions";`)
}
