CREATE TABLE "core"."follow_up_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"saved_search_id" uuid,
	"featured_listing_id" uuid,
	"operation" text NOT NULL,
	"currency" text NOT NULL,
	"price_cents" bigint,
	"detected_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"shared_listing_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."follow_up_matches" ADD CONSTRAINT "follow_up_matches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."follow_up_matches" ADD CONSTRAINT "follow_up_matches_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "core"."saved_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."follow_up_matches" ADD CONSTRAINT "follow_up_matches_featured_listing_id_featured_listings_id_fk" FOREIGN KEY ("featured_listing_id") REFERENCES "core"."featured_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."follow_up_matches" ADD CONSTRAINT "follow_up_matches_shared_listing_id_shared_listings_id_fk" FOREIGN KEY ("shared_listing_id") REFERENCES "core"."shared_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_matches_new_listing_uq" ON "core"."follow_up_matches" USING btree ("client_id","property_id") WHERE reason = 'new_listing';--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_matches_price_drop_uq" ON "core"."follow_up_matches" USING btree ("client_id","property_id","operation","price_cents") WHERE reason = 'price_drop';--> statement-breakpoint
CREATE INDEX "follow_up_matches_pending_idx" ON "core"."follow_up_matches" USING btree ("client_id","detected_at") WHERE sent_at is null;