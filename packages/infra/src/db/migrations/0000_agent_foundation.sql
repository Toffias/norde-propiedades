CREATE SCHEMA IF NOT EXISTS "core";
--> statement-breakpoint
CREATE TABLE "core"."client_channels" (
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"first_contact_at" timestamp with time zone NOT NULL,
	"last_contact_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_channels_client_id_channel_external_id_pk" PRIMARY KEY("client_id","channel","external_id")
);
--> statement-breakpoint
CREATE TABLE "core"."clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"phone_e164" text,
	"phone_match_key" text,
	"email" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"origin_channel" text NOT NULL,
	"type" text NOT NULL,
	"intent" text NOT NULL,
	"status" text NOT NULL,
	"property_id" uuid,
	"search" jsonb,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"channel_message_id" text,
	"kind" text NOT NULL,
	"body" jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"contact_name" text,
	"client_id" uuid,
	"status" text NOT NULL,
	"agent_memory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_criteria" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "core"."properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"operation" text NOT NULL,
	"property_type" text NOT NULL,
	"status" text NOT NULL,
	"published_on_web" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"address" text,
	"show_exact_address" boolean DEFAULT false NOT NULL,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"price_cents" bigint,
	"currency" text NOT NULL,
	"expenses_cents" bigint,
	"rooms" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"surface_total_m2" numeric(10, 2),
	"surface_covered_m2" numeric(10, 2),
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "properties_code_unique" UNIQUE("code"),
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "core"."client_channels" ADD CONSTRAINT "client_channels_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD CONSTRAINT "opportunities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "core"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_channels_identity_idx" ON "core"."client_channels" USING btree ("channel","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_phone_match_key_uq" ON "core"."clients" USING btree ("phone_match_key") WHERE phone_match_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_email_uq" ON "core"."clients" USING btree ("email") WHERE email is not null;--> statement-breakpoint
CREATE INDEX "opportunities_client_status_idx" ON "core"."opportunities" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_status_created_idx" ON "core"."opportunities" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_channel_message_uq" ON "core"."conversation_messages" USING btree ("channel","direction","channel_message_id") WHERE channel_message_id is not null;--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "core"."conversation_messages" USING btree ("conversation_id","recorded_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_usage_idx" ON "core"."conversation_messages" USING btree ("channel","direction","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_identity_uq" ON "core"."conversations" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "conversations_last_activity_idx" ON "core"."conversations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "conversations_client_idx" ON "core"."conversations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "core"."audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "core"."audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "core"."outbox" USING btree ("recorded_at") WHERE published_at is null;--> statement-breakpoint
CREATE INDEX "properties_listing_idx" ON "core"."properties" USING btree ("status","published_on_web","operation","property_type");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "core"."properties" USING btree ("currency","price_cents");