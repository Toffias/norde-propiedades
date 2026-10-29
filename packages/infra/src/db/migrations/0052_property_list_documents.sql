CREATE TABLE "core"."property_list_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_ids" uuid[] NOT NULL,
	"layout" text NOT NULL,
	"include_agent" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"error" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."property_documents" ADD COLUMN "layout" text;--> statement-breakpoint
ALTER TABLE "core"."property_documents" ADD COLUMN "include_agent" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "property_list_documents_pending_requester_idx" ON "core"."property_list_documents" USING btree ("requested_by") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "property_list_documents_requester_updated_idx" ON "core"."property_list_documents" USING btree ("requested_by","updated_at");--> statement-breakpoint
CREATE INDEX "property_list_documents_updated_idx" ON "core"."property_list_documents" USING btree ("updated_at");