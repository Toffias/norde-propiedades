CREATE INDEX "reservations_reserved_idx" ON "core"."reservations" USING btree ("reserved_at","id");--> statement-breakpoint
CREATE INDEX "reservations_signing_idx" ON "core"."reservations" USING btree ("estimated_signing_date","id");--> statement-breakpoint
CREATE INDEX "reservations_operation_reserved_idx" ON "core"."reservations" USING btree ("operation","reserved_at");