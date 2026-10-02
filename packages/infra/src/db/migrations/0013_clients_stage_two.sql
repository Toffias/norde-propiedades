ALTER TABLE "core"."clients" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
CREATE INDEX "client_tag_groups_position_idx" ON "core"."client_tag_groups" USING btree ("position","id");--> statement-breakpoint
CREATE INDEX "client_tag_groups_name_idx" ON "core"."client_tag_groups" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "client_tag_groups_name_trgm_idx" ON "core"."client_tag_groups" USING gin (core.search_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_tags_group_idx" ON "core"."client_tags" USING btree ("group_id","name");--> statement-breakpoint
CREATE INDEX "client_tags_name_idx" ON "core"."client_tags" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "client_tags_name_trgm_idx" ON "core"."client_tags" USING gin (core.search_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_initial_name_idx" ON "core"."clients" USING btree (left(core.search_normalize(coalesce("name", '')), 1),lower("name"),"id") WHERE deleted_at is null;