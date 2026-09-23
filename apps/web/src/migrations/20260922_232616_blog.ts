import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_redirects_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "payload"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "payload"."posts_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "payload"."posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"hero_image_id" integer,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"categories_id" integer,
  	"posts_id" integer
  );
  
  CREATE TABLE "payload"."_posts_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_hero_image_id" integer,
  	"version_content" jsonb,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_published_at" timestamp(3) with time zone,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"categories_id" integer,
  	"posts_id" integer
  );
  
  CREATE TABLE "payload"."categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"to_type" "payload"."enum_redirects_to_type" DEFAULT 'reference',
  	"to_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."redirects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  CREATE TABLE "payload"."payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "payload"."enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "payload"."enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload"."payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "payload"."enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users" ADD COLUMN "role" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "photo_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "posts_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "redirects_id" integer;
  ALTER TABLE "payload"."posts_faq" ADD CONSTRAINT "posts_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."posts" ADD CONSTRAINT "posts_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."posts" ADD CONSTRAINT "posts_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."posts_rels" ADD CONSTRAINT "posts_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."posts_rels" ADD CONSTRAINT "posts_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."posts_rels" ADD CONSTRAINT "posts_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v_version_faq" ADD CONSTRAINT "_posts_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."redirects_rels" ADD CONSTRAINT "redirects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."redirects_rels" ADD CONSTRAINT "redirects_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_faq_order_idx" ON "payload"."posts_faq" USING btree ("_order");
  CREATE INDEX "posts_faq_parent_id_idx" ON "payload"."posts_faq" USING btree ("_parent_id");
  CREATE INDEX "posts_hero_image_idx" ON "payload"."posts" USING btree ("hero_image_id");
  CREATE INDEX "posts_meta_meta_image_idx" ON "payload"."posts" USING btree ("meta_image_id");
  CREATE INDEX "posts_published_at_idx" ON "payload"."posts" USING btree ("published_at");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "payload"."posts" USING btree ("slug");
  CREATE INDEX "posts_updated_at_idx" ON "payload"."posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "payload"."posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "payload"."posts" USING btree ("_status");
  CREATE INDEX "posts_rels_order_idx" ON "payload"."posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "payload"."posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "payload"."posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_users_id_idx" ON "payload"."posts_rels" USING btree ("users_id");
  CREATE INDEX "posts_rels_categories_id_idx" ON "payload"."posts_rels" USING btree ("categories_id");
  CREATE INDEX "posts_rels_posts_id_idx" ON "payload"."posts_rels" USING btree ("posts_id");
  CREATE INDEX "_posts_v_version_faq_order_idx" ON "payload"."_posts_v_version_faq" USING btree ("_order");
  CREATE INDEX "_posts_v_version_faq_parent_id_idx" ON "payload"."_posts_v_version_faq" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "payload"."_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_hero_image_idx" ON "payload"."_posts_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_posts_v_version_meta_version_meta_image_idx" ON "payload"."_posts_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_posts_v_version_version_published_at_idx" ON "payload"."_posts_v" USING btree ("version_published_at");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "payload"."_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "payload"."_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "payload"."_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "payload"."_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "payload"."_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "payload"."_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_latest_idx" ON "payload"."_posts_v" USING btree ("latest");
  CREATE INDEX "_posts_v_autosave_idx" ON "payload"."_posts_v" USING btree ("autosave");
  CREATE INDEX "_posts_v_rels_order_idx" ON "payload"."_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "payload"."_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "payload"."_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_users_id_idx" ON "payload"."_posts_v_rels" USING btree ("users_id");
  CREATE INDEX "_posts_v_rels_categories_id_idx" ON "payload"."_posts_v_rels" USING btree ("categories_id");
  CREATE INDEX "_posts_v_rels_posts_id_idx" ON "payload"."_posts_v_rels" USING btree ("posts_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "payload"."categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "payload"."categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "payload"."categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "payload"."redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "payload"."redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "payload"."redirects" USING btree ("created_at");
  CREATE INDEX "redirects_rels_order_idx" ON "payload"."redirects_rels" USING btree ("order");
  CREATE INDEX "redirects_rels_parent_idx" ON "payload"."redirects_rels" USING btree ("parent_id");
  CREATE INDEX "redirects_rels_path_idx" ON "payload"."redirects_rels" USING btree ("path");
  CREATE INDEX "redirects_rels_posts_id_idx" ON "payload"."redirects_rels" USING btree ("posts_id");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload"."payload_jobs" USING btree ("created_at");
  ALTER TABLE "payload"."users" ADD CONSTRAINT "users_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "payload"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_photo_idx" ON "payload"."users" USING btree ("photo_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("redirects_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."posts_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."posts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_posts_v_version_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_posts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_posts_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."redirects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."redirects_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."payload_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."posts_faq" CASCADE;
  DROP TABLE "payload"."posts" CASCADE;
  DROP TABLE "payload"."posts_rels" CASCADE;
  DROP TABLE "payload"."_posts_v_version_faq" CASCADE;
  DROP TABLE "payload"."_posts_v" CASCADE;
  DROP TABLE "payload"."_posts_v_rels" CASCADE;
  DROP TABLE "payload"."categories" CASCADE;
  DROP TABLE "payload"."redirects" CASCADE;
  DROP TABLE "payload"."redirects_rels" CASCADE;
  DROP TABLE "payload"."payload_jobs_log" CASCADE;
  DROP TABLE "payload"."payload_jobs" CASCADE;
  ALTER TABLE "payload"."users" DROP CONSTRAINT "users_photo_id_media_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_posts_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_redirects_fk";
  
  DROP INDEX "payload"."users_photo_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_posts_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_redirects_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "role";
  ALTER TABLE "payload"."users" DROP COLUMN "photo_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "posts_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "redirects_id";
  DROP TYPE "payload"."enum_posts_status";
  DROP TYPE "payload"."enum__posts_v_version_status";
  DROP TYPE "payload"."enum_redirects_to_type";
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  DROP TYPE "payload"."enum_payload_jobs_log_state";
  DROP TYPE "payload"."enum_payload_jobs_task_slug";`)
}
