ALTER TABLE "core"."branches" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("name", ''))) STORED;--> statement-breakpoint
ALTER TABLE "core"."teams" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."teams" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "core"."teams" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("name", ''))) STORED;--> statement-breakpoint
CREATE INDEX "branches_deleted_name_idx" ON "core"."branches" USING btree ("deleted_at","name");--> statement-breakpoint
CREATE INDEX "branches_search_text_idx" ON "core"."branches" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_uq" ON "core"."teams" USING btree ("name") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "teams_deleted_name_idx" ON "core"."teams" USING btree ("deleted_at","name");--> statement-breakpoint
CREATE INDEX "teams_search_text_idx" ON "core"."teams" USING gin ("search_text" gin_trgm_ops);