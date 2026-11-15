CREATE INDEX "featured_listings_opportunity_idx" ON "core"."featured_listings" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "follow_up_matches_saved_search_idx" ON "core"."follow_up_matches" USING btree ("saved_search_id");--> statement-breakpoint
CREATE INDEX "follow_up_matches_featured_listing_idx" ON "core"."follow_up_matches" USING btree ("featured_listing_id");--> statement-breakpoint
CREATE INDEX "follow_up_matches_shared_listing_idx" ON "core"."follow_up_matches" USING btree ("shared_listing_id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_waiting_idx" ON "core"."opportunities" USING btree ("stage_id",(coalesce("status_changed_at", "created_at")),"id");--> statement-breakpoint
CREATE INDEX "opportunities_close_reason_idx" ON "core"."opportunities" USING btree ("close_reason_id");--> statement-breakpoint
CREATE INDEX "saved_searches_opportunity_idx" ON "core"."saved_searches" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "shared_listings_opportunity_idx" ON "core"."shared_listings" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "core"."idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_published_idx" ON "core"."outbox" USING btree ("published_at") WHERE published_at is not null;