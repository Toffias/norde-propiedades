CREATE INDEX "developments_updated_idx" ON "core"."developments" USING btree ("updated_at","id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_type_idx" ON "core"."developments" USING btree ("development_type") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_construction_status_idx" ON "core"."developments" USING btree ("construction_status") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_deleted_idx" ON "core"."developments" USING btree ("deleted_at") WHERE deleted_at is not null;