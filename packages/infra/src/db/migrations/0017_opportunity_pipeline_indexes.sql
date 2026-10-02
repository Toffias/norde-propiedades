CREATE INDEX "opportunities_stage_updated_idx" ON "core"."opportunities" USING btree ("stage_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_created_idx" ON "core"."opportunities" USING btree ("stage_id","created_at","id");--> statement-breakpoint
CREATE INDEX "opportunities_agent_stage_idx" ON "core"."opportunities" USING btree ("agent_id","stage_id");--> statement-breakpoint
CREATE INDEX "opportunities_branch_stage_idx" ON "core"."opportunities" USING btree ("branch_id","stage_id");--> statement-breakpoint
CREATE INDEX "opportunities_origin_channel_stage_idx" ON "core"."opportunities" USING btree ("origin_channel","stage_id");--> statement-breakpoint
CREATE INDEX "opportunities_status_updated_idx" ON "core"."opportunities" USING btree ("status","updated_at");