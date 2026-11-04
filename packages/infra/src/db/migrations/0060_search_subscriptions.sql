CREATE TABLE "core"."search_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"name" text,
	"email" text,
	"summary" text NOT NULL,
	"frequency" text NOT NULL,
	"operation" text NOT NULL,
	"property_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"currency" text,
	"min_price_cents" bigint,
	"max_price_cents" bigint,
	"location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"min_rooms" integer,
	"requested_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"client_id" uuid,
	"saved_search_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."saved_searches" ADD COLUMN "frequency" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."saved_searches" ADD COLUMN "last_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "default_assignee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."search_subscriptions" ADD CONSTRAINT "search_subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."search_subscriptions" ADD CONSTRAINT "search_subscriptions_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "core"."saved_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_subscriptions_token_hash_uq" ON "core"."search_subscriptions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "search_subscriptions_email_requested_idx" ON "core"."search_subscriptions" USING btree ("email","requested_at");--> statement-breakpoint
CREATE INDEX "search_subscriptions_pending_expires_idx" ON "core"."search_subscriptions" USING btree ("expires_at") WHERE confirmed_at is null;--> statement-breakpoint
CREATE INDEX "search_subscriptions_client_idx" ON "core"."search_subscriptions" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_default_assignee_uq" ON "core"."users" USING btree ("default_assignee") WHERE default_assignee;