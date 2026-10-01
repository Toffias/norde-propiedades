ALTER TABLE "core"."roles" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("name", ''))) STORED;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("name", '') || ' ' || coalesce("email", ''))) STORED;--> statement-breakpoint
CREATE INDEX "roles_name_idx" ON "core"."roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "roles_search_text_idx" ON "core"."roles" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_status_email_idx" ON "core"."users" USING btree ("status","email");--> statement-breakpoint
CREATE INDEX "users_status_last_login_idx" ON "core"."users" USING btree ("status","last_login_at");--> statement-breakpoint
CREATE INDEX "users_status_created_idx" ON "core"."users" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "users_search_text_idx" ON "core"."users" USING gin ("search_text" gin_trgm_ops);