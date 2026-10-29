import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_about_page_stats_icon" AS ENUM('years', 'properties', 'deals', 'inquiries', 'locations', 'services', 'team');
  ALTER TABLE "payload"."about_page_stats" ADD COLUMN "icon" "payload"."enum_about_page_stats_icon";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."about_page_stats" DROP COLUMN "icon";
  DROP TYPE "payload"."enum_about_page_stats_icon";`)
}
