ALTER TABLE "core"."inquiries" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
CREATE INDEX "inquiries_status_branch_received_idx" ON "core"."inquiries" USING btree ("status","branch_id","received_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "inquiries_deleted_received_idx" ON "core"."inquiries" USING btree ("received_at") WHERE deleted_at is not null;