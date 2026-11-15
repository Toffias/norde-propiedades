import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" ADD COLUMN "is_admin" boolean DEFAULT false;`)
  // Los editores que ya existen siguen pudiendo administrar a los demás.
  await db.execute(sql`
   UPDATE "payload"."users" SET "is_admin" = true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" DROP COLUMN "is_admin";`)
}
