import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_experience_menu_sections" AS ENUM('dashboard', 'crm', 'sales', 'learning', 'students', 'content', 'settings');
  CREATE TYPE "public"."enum_roles_experience_dashboard_widgets" AS ENUM('kpis', 'alerts', 'activity', 'donut', 'bars', 'quick', 'summary');
  CREATE TYPE "public"."enum_roles_experience_landing" AS ENUM('auto', 'overview', 'leads', 'finance', 'students', 'teaching', 'support', 'content', 'admin');
  CREATE TABLE "roles_experience_menu_sections" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_roles_experience_menu_sections",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "roles_experience_dashboard_widgets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_roles_experience_dashboard_widgets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "roles" ADD COLUMN "security_require2fa" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "security_max_session_hours" numeric;
  ALTER TABLE "roles" ADD COLUMN "security_login_hours_enabled" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "security_login_hours_from" numeric;
  ALTER TABLE "roles" ADD COLUMN "security_login_hours_to" numeric;
  ALTER TABLE "roles" ADD COLUMN "experience_landing" "enum_roles_experience_landing" DEFAULT 'auto';
  ALTER TABLE "roles_experience_menu_sections" ADD CONSTRAINT "roles_experience_menu_sections_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles_experience_dashboard_widgets" ADD CONSTRAINT "roles_experience_dashboard_widgets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "roles_experience_menu_sections_order_idx" ON "roles_experience_menu_sections" USING btree ("order");
  CREATE INDEX "roles_experience_menu_sections_parent_idx" ON "roles_experience_menu_sections" USING btree ("parent_id");
  CREATE INDEX "roles_experience_dashboard_widgets_order_idx" ON "roles_experience_dashboard_widgets" USING btree ("order");
  CREATE INDEX "roles_experience_dashboard_widgets_parent_idx" ON "roles_experience_dashboard_widgets" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "roles_experience_menu_sections" CASCADE;
  DROP TABLE "roles_experience_dashboard_widgets" CASCADE;
  ALTER TABLE "roles" DROP COLUMN "security_require2fa";
  ALTER TABLE "roles" DROP COLUMN "security_max_session_hours";
  ALTER TABLE "roles" DROP COLUMN "security_login_hours_enabled";
  ALTER TABLE "roles" DROP COLUMN "security_login_hours_from";
  ALTER TABLE "roles" DROP COLUMN "security_login_hours_to";
  ALTER TABLE "roles" DROP COLUMN "experience_landing";
  DROP TYPE "public"."enum_roles_experience_menu_sections";
  DROP TYPE "public"."enum_roles_experience_dashboard_widgets";
  DROP TYPE "public"."enum_roles_experience_landing";`)
}
