import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."google_reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"author_name" varchar NOT NULL,
  	"author_photo_id" integer,
  	"author_detail" varchar,
  	"rating" numeric DEFAULT 5 NOT NULL,
  	"text" varchar NOT NULL,
  	"reviewed_at" timestamp(3) with time zone NOT NULL,
  	"review_url" varchar,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "google_reviews_id" integer;
  ALTER TABLE "payload"."about_page" ADD COLUMN "google_reviews_url" varchar;
  ALTER TABLE "payload"."google_reviews" ADD CONSTRAINT "google_reviews_author_photo_id_media_id_fk" FOREIGN KEY ("author_photo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "google_reviews_author_photo_idx" ON "payload"."google_reviews" USING btree ("author_photo_id");
  CREATE INDEX "google_reviews_order_idx" ON "payload"."google_reviews" USING btree ("order");
  CREATE INDEX "google_reviews_active_idx" ON "payload"."google_reviews" USING btree ("active");
  CREATE INDEX "google_reviews_updated_at_idx" ON "payload"."google_reviews" USING btree ("updated_at");
  CREATE INDEX "google_reviews_created_at_idx" ON "payload"."google_reviews" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_reviews_fk" FOREIGN KEY ("google_reviews_id") REFERENCES "payload"."google_reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_google_reviews_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("google_reviews_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."google_reviews" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."google_reviews" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_reviews_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_google_reviews_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "google_reviews_id";
  ALTER TABLE "payload"."about_page" DROP COLUMN "google_reviews_url";`)
}
