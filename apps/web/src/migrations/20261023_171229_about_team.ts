import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."team_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar NOT NULL,
  	"area" varchar,
  	"license" varchar,
  	"photo_id" integer,
  	"whatsapp" varchar,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."about_page_milestones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar NOT NULL,
  	"image_id" integer
  );
  
  CREATE TABLE "payload"."about_page_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"prefix" varchar,
  	"value" numeric NOT NULL,
  	"suffix" varchar,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."about_page" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"intro" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "team_members_id" integer;
  ALTER TABLE "payload"."team_members" ADD CONSTRAINT "team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."about_page_milestones" ADD CONSTRAINT "about_page_milestones_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."about_page_milestones" ADD CONSTRAINT "about_page_milestones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."about_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."about_page_stats" ADD CONSTRAINT "about_page_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."about_page"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "team_members_photo_idx" ON "payload"."team_members" USING btree ("photo_id");
  CREATE INDEX "team_members_order_idx" ON "payload"."team_members" USING btree ("order");
  CREATE INDEX "team_members_active_idx" ON "payload"."team_members" USING btree ("active");
  CREATE INDEX "team_members_updated_at_idx" ON "payload"."team_members" USING btree ("updated_at");
  CREATE INDEX "team_members_created_at_idx" ON "payload"."team_members" USING btree ("created_at");
  CREATE INDEX "about_page_milestones_order_idx" ON "payload"."about_page_milestones" USING btree ("_order");
  CREATE INDEX "about_page_milestones_parent_id_idx" ON "payload"."about_page_milestones" USING btree ("_parent_id");
  CREATE INDEX "about_page_milestones_image_idx" ON "payload"."about_page_milestones" USING btree ("image_id");
  CREATE INDEX "about_page_stats_order_idx" ON "payload"."about_page_stats" USING btree ("_order");
  CREATE INDEX "about_page_stats_parent_id_idx" ON "payload"."about_page_stats" USING btree ("_parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_team_members_fk" FOREIGN KEY ("team_members_id") REFERENCES "payload"."team_members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_team_members_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("team_members_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."team_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."about_page_milestones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."about_page_stats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."about_page" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."team_members" CASCADE;
  DROP TABLE "payload"."about_page_milestones" CASCADE;
  DROP TABLE "payload"."about_page_stats" CASCADE;
  DROP TABLE "payload"."about_page" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_team_members_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_team_members_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "team_members_id";`)
}
