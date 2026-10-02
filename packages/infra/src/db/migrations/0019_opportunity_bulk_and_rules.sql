CREATE TABLE "core"."opportunity_bulk_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action" jsonb NOT NULL,
	"selection" jsonb NOT NULL,
	"status" text NOT NULL,
	"totals" jsonb NOT NULL,
	"cursor" uuid,
	"failure" text,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."opportunity_status_changes" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
CREATE INDEX "opportunity_bulk_operations_requested_idx" ON "core"."opportunity_bulk_operations" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_status_changes_source_event_uq" ON "core"."opportunity_status_changes" USING btree ("source_event_id") WHERE "core"."opportunity_status_changes"."source_event_id" is not null;