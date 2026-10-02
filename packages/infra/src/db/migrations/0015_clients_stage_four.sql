ALTER TABLE "core"."import_jobs" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "core"."import_jobs" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."import_jobs" ADD COLUMN "failure" text;--> statement-breakpoint
CREATE INDEX "clients_merged_into_idx" ON "core"."clients" USING btree ("merged_into_id") WHERE merged_into_id is not null;