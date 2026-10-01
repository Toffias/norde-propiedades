ALTER TABLE "core"."roles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."roles" ADD COLUMN "deleted_by" text;--> statement-breakpoint
CREATE INDEX "roles_deleted_name_idx" ON "core"."roles" USING btree ("deleted_at","name");