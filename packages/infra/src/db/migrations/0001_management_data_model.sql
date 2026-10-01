-- Búsqueda de texto (D6 de #19): trigramas y sin acentos. Las dos extensiones son "trusted"
-- desde PostgreSQL 13: las puede crear el dueño de la base.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;--> statement-breakpoint
-- `unaccent()` no es IMMUTABLE (depende del diccionario por defecto) y no se puede usar en una
-- columna generada. Con el diccionario explícito el resultado es estable.
CREATE OR REPLACE FUNCTION core.search_normalize(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, value)) $$;--> statement-breakpoint
CREATE TABLE "core"."appraisal_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appraisal_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."appraisals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"requester_client_id" uuid,
	"appraiser_user_id" uuid,
	"producer_user_id" uuid,
	"branch_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text NOT NULL,
	"status_changed_at" timestamp with time zone,
	"property_type" text NOT NULL,
	"address" text,
	"location_id" uuid,
	"surface_total_m2" numeric(10, 2),
	"surface_covered_m2" numeric(10, 2),
	"rooms" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"condition" text,
	"visit_at" timestamp with time zone,
	"sale_min_cents" bigint,
	"sale_max_cents" bigint,
	"sale_currency" text,
	"rent_min_cents" bigint,
	"rent_max_cents" bigint,
	"rent_currency" text,
	"comparables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observations" text,
	"converted_property_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."client_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."client_emails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."client_phones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"phone_e164" text NOT NULL,
	"phone_match_key" text NOT NULL,
	"contact_hours" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."client_relations" (
	"client_id" uuid NOT NULL,
	"related_client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "client_relations_client_id_related_client_id_kind_pk" PRIMARY KEY("client_id","related_client_id","kind")
);
--> statement-breakpoint
CREATE TABLE "core"."client_tag_assignments" (
	"client_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "client_tag_assignments_client_id_tag_id_pk" PRIMARY KEY("client_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "core"."client_tag_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."client_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."featured_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"property_id" uuid NOT NULL,
	"match_score" smallint,
	"auto_send_updates" boolean DEFAULT false NOT NULL,
	"reaction" text,
	"reacted_at" timestamp with time zone,
	"featured_by" text NOT NULL,
	"featured_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."follow_up_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"new_matches_enabled" boolean DEFAULT false NOT NULL,
	"new_matches_subject" text,
	"new_matches_body" text,
	"featured_changes_enabled" boolean DEFAULT false NOT NULL,
	"featured_changes_subject" text,
	"featured_changes_body" text,
	"create_search_from_web_inquiry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "follow_up_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."inquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"external_id" text,
	"received_at" timestamp with time zone NOT NULL,
	"sender_name" text,
	"sender_email" text,
	"sender_phone_e164" text,
	"sender_phone_match_key" text,
	"message" text,
	"property_id" uuid,
	"development_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_id" uuid,
	"opportunity_id" uuid,
	"assigned_agent_id" uuid,
	"assigned_at" timestamp with time zone,
	"assigned_by" text,
	"auto_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."inquiry_assignment_rule_agents" (
	"rule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "inquiry_assignment_rule_agents_rule_id_user_id_pk" PRIMARY KEY("rule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."inquiry_assignment_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."inquiry_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"business_hours" jsonb,
	"off_hours_policy" text DEFAULT 'assign' NOT NULL,
	"on_call_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "inquiry_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."opportunity_close_reasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rating" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."opportunity_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"stage_on_create_id" uuid,
	"stage_on_assign_id" uuid,
	"stage_on_reactivate_id" uuid,
	"stage_for_owners_id" uuid,
	"stage_after_message_id" uuid,
	"stage_after_like_id" uuid,
	"stage_after_dislike_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "opportunity_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."opportunity_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."opportunity_status_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."quick_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"automation" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."saved_searches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"name" text,
	"operation" text NOT NULL,
	"property_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"currency" text,
	"min_price_cents" bigint,
	"max_price_cents" bigint,
	"location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"min_rooms" integer,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_send" boolean DEFAULT false NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."shared_listing_items" (
	"shared_listing_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"first_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"reaction" text,
	"reacted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "shared_listing_items_shared_listing_id_property_id_pk" PRIMARY KEY("shared_listing_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "core"."shared_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"address" text,
	"email" text,
	"phone_e164" text,
	"whatsapp_e164" text,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."user_favorites" (
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_favorites_user_id_entity_type_entity_id_pk" PRIMARY KEY("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_e164" text,
	"branch_id" uuid,
	"role_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"supervision_mode" text DEFAULT 'none' NOT NULL,
	"email_sender_name" text,
	"email_signature" text,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "core"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"link" text,
	"source_event_id" uuid,
	"read_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."erasure_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"erased_entity_type" text NOT NULL,
	"erased_entity_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"executed_by" text NOT NULL,
	"executed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_job_errors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer,
	"entity_type" text,
	"message" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"storage_key" text,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" uuid NOT NULL,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."portal_accounts" (
	"portal" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"credentials_encrypted" "bytea",
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"connected_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."portal_listing_daily_stats" (
	"listing_id" uuid NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"contacts" integer DEFAULT 0 NOT NULL,
	"favorites" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "portal_listing_daily_stats_listing_id_date_pk" PRIMARY KEY("listing_id","date")
);
--> statement-breakpoint
CREATE TABLE "core"."portal_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portal" text NOT NULL,
	"property_id" uuid,
	"development_id" uuid,
	"external_id" text,
	"listing_type" text DEFAULT 'simple' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "portal_listings_single_owner" CHECK (num_nonnulls(property_id, development_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "core"."attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid,
	"development_id" uuid,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"show_on_web" boolean DEFAULT false NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachments_single_owner" CHECK (num_nonnulls(property_id, development_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "core"."development_features" (
	"development_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "development_features_development_id_feature_id_pk" PRIMARY KEY("development_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "core"."development_tag_assignments" (
	"development_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "development_tag_assignments_development_id_tag_id_pk" PRIMARY KEY("development_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "core"."developments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"development_type" text,
	"status" text DEFAULT 'loading' NOT NULL,
	"construction_status" text,
	"delivery_date" date,
	"private_address" text,
	"publish_address" text,
	"portal_title" text,
	"location_id" uuid,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"developer_name" text,
	"commercial_contact_client_id" uuid,
	"website_url" text,
	"description" text DEFAULT '' NOT NULL,
	"financing_details" text,
	"is_financed" boolean DEFAULT false NOT NULL,
	"accepts_swap" boolean DEFAULT false NOT NULL,
	"immediate_deed" boolean DEFAULT false NOT NULL,
	"published_on_web" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"producer_user_id" uuid,
	"branch_id" uuid,
	"search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("code", '') || ' ' || coalesce("name", '') || ' ' || coalesce("publish_address", '') || ' ' || coalesce("developer_name", ''))) STORED,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."features" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"path" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."media_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid,
	"development_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"show_on_web" boolean DEFAULT true NOT NULL,
	"include_in_pdf" boolean DEFAULT true NOT NULL,
	"rotation" smallint DEFAULT 0 NOT NULL,
	"description" text,
	"width" integer,
	"height" integer,
	"size_bytes" bigint,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "media_items_single_owner" CHECK (num_nonnulls(property_id, development_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "core"."property_appraisers" (
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "property_appraisers_property_id_user_id_pk" PRIMARY KEY("property_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."property_custom_attribute_values" (
	"property_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric(14, 4),
	"value_boolean" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "property_custom_attribute_values_property_id_attribute_id_pk" PRIMARY KEY("property_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "core"."property_custom_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."property_features" (
	"property_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "property_features_property_id_feature_id_pk" PRIMARY KEY("property_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "core"."property_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"price_cents" bigint,
	"currency" text NOT NULL,
	"price_on_request" boolean DEFAULT false NOT NULL,
	"commission_pct" numeric(5, 2),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."property_owners" (
	"property_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "property_owners_property_id_client_id_pk" PRIMARY KEY("property_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "core"."property_price_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"old_price_cents" bigint,
	"new_price_cents" bigint,
	"currency" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."property_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"grid_columns" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "property_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."property_tag_assignments" (
	"property_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "property_tag_assignments_property_id_tag_id_pk" PRIMARY KEY("property_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "core"."property_tag_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."property_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."property_type_settings" (
	"property_type" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"visible_attributes" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."reservation_managers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."reservation_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"required_client_tag_id" uuid,
	"manager_required" boolean DEFAULT false NOT NULL,
	"notify_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "reservation_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"agent_user_id" uuid,
	"manager_user_id" uuid,
	"branch_id" uuid,
	"operation" text NOT NULL,
	"amount_cents" bigint,
	"currency" text,
	"commission_pct" numeric(5, 2),
	"commission_cents" bigint,
	"commission_currency" text,
	"status" text DEFAULT 'active' NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	"estimated_signing_date" date,
	"signed_at" timestamp with time zone,
	"fallen_at" timestamp with time zone,
	"fallen_reason" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."company_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "core"."company_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"name" text DEFAULT 'Norde Propiedades' NOT NULL,
	"logo_url" text,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"web_property_url_template" text,
	"web_development_url_template" text,
	"news_scope" text DEFAULT 'all' NOT NULL,
	"watermark" jsonb,
	"portal_description_footer" text,
	"pdf_settings" jsonb,
	"email_from_name" text,
	"email_reply_to" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "company_settings_singleton" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "core"."file_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."reference_code_sequences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_value" text DEFAULT '' NOT NULL,
	"prefix" text NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "kind" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "client_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("name", '') || ' ' || coalesce("email", '') || ' ' || coalesce("phone_e164", '') || ' ' || coalesce("company_name", '') || ' ' || coalesce("document_number", ''))) STORED;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."clients" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "development_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "close_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "referred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "referral_result" text;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "core"."conversations" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "core"."conversations" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD COLUMN "client_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "development_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "street_number" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "floor" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "publish_address" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "portal_title" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "price_on_web" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "toilets" integer;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "parking_spaces" integer;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "age_years" integer;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "orientation" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "disposition" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "surface_semi_covered_m2" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "surface_land_m2" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "front_m" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "depth_m" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "is_furnished" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "credit_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "professional_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "is_exclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "accepts_swap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "immediate_deed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "has_financing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "keys_location" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "legal_info" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "internal_comments" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "tour_360_url" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "producer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "maintenance_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "search_text" text GENERATED ALWAYS AS (core.search_normalize(coalesce("code", '') || ' ' || coalesce("title", '') || ' ' || coalesce("address", '') || ' ' || coalesce("street", '') || ' ' || coalesce("neighborhood", '') || ' ' || coalesce("city", ''))) STORED;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "core"."appraisal_photos" ADD CONSTRAINT "appraisal_photos_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "core"."appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_activities" ADD CONSTRAINT "client_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_activities" ADD CONSTRAINT "client_activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "core"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_emails" ADD CONSTRAINT "client_emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_phones" ADD CONSTRAINT "client_phones_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_relations" ADD CONSTRAINT "client_relations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_relations" ADD CONSTRAINT "client_relations_related_client_id_clients_id_fk" FOREIGN KEY ("related_client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_tag_id_client_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "core"."client_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_tags" ADD CONSTRAINT "client_tags_group_id_client_tag_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "core"."client_tag_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."featured_listings" ADD CONSTRAINT "featured_listings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."featured_listings" ADD CONSTRAINT "featured_listings_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "core"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inquiries" ADD CONSTRAINT "inquiries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inquiries" ADD CONSTRAINT "inquiries_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "core"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inquiry_assignment_rule_agents" ADD CONSTRAINT "inquiry_assignment_rule_agents_rule_id_inquiry_assignment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "core"."inquiry_assignment_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_on_create_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_on_create_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_on_assign_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_on_assign_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_on_reactivate_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_on_reactivate_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_for_owners_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_for_owners_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_after_message_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_after_message_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_after_like_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_after_like_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_settings" ADD CONSTRAINT "opportunity_settings_stage_after_dislike_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_after_dislike_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunity_status_changes" ADD CONSTRAINT "opportunity_status_changes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "core"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."saved_searches" ADD CONSTRAINT "saved_searches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."saved_searches" ADD CONSTRAINT "saved_searches_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "core"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."shared_listing_items" ADD CONSTRAINT "shared_listing_items_shared_listing_id_shared_listings_id_fk" FOREIGN KEY ("shared_listing_id") REFERENCES "core"."shared_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."shared_listings" ADD CONSTRAINT "shared_listings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "core"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."teams" ADD CONSTRAINT "teams_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_job_errors" ADD CONSTRAINT "import_job_errors_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "core"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_listing_daily_stats" ADD CONSTRAINT "portal_listing_daily_stats_listing_id_portal_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "core"."portal_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD CONSTRAINT "portal_listings_portal_portal_accounts_portal_fk" FOREIGN KEY ("portal") REFERENCES "core"."portal_accounts"("portal") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."attachments" ADD CONSTRAINT "attachments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."attachments" ADD CONSTRAINT "attachments_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."development_features" ADD CONSTRAINT "development_features_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."development_features" ADD CONSTRAINT "development_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "core"."features"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."development_tag_assignments" ADD CONSTRAINT "development_tag_assignments_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."development_tag_assignments" ADD CONSTRAINT "development_tag_assignments_tag_id_property_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "core"."property_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."developments" ADD CONSTRAINT "developments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "core"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "core"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."media_items" ADD CONSTRAINT "media_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."media_items" ADD CONSTRAINT "media_items_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_appraisers" ADD CONSTRAINT "property_appraisers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_custom_attribute_values" ADD CONSTRAINT "property_custom_attribute_values_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_custom_attribute_values" ADD CONSTRAINT "property_custom_attribute_values_attribute_id_property_custom_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "core"."property_custom_attributes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_features" ADD CONSTRAINT "property_features_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_features" ADD CONSTRAINT "property_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "core"."features"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_operations" ADD CONSTRAINT "property_operations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_owners" ADD CONSTRAINT "property_owners_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_price_changes" ADD CONSTRAINT "property_price_changes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_tag_assignments" ADD CONSTRAINT "property_tag_assignments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_tag_assignments" ADD CONSTRAINT "property_tag_assignments_tag_id_property_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "core"."property_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."property_tags" ADD CONSTRAINT "property_tags_group_id_property_tag_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "core"."property_tag_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "core"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."company_files" ADD CONSTRAINT "company_files_folder_id_file_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "core"."file_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."file_folders" ADD CONSTRAINT "file_folders_parent_id_file_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "core"."file_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appraisal_photos_appraisal_position_idx" ON "core"."appraisal_photos" USING btree ("appraisal_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "appraisals_code_uq" ON "core"."appraisals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "appraisals_status_created_idx" ON "core"."appraisals" USING btree ("status","created_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "appraisals_appraiser_status_idx" ON "core"."appraisals" USING btree ("appraiser_user_id","status");--> statement-breakpoint
CREATE INDEX "appraisals_producer_status_idx" ON "core"."appraisals" USING btree ("producer_user_id","status");--> statement-breakpoint
CREATE INDEX "appraisals_branch_status_idx" ON "core"."appraisals" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "appraisals_type_status_idx" ON "core"."appraisals" USING btree ("property_type","status");--> statement-breakpoint
CREATE INDEX "appraisals_visit_idx" ON "core"."appraisals" USING btree ("visit_at");--> statement-breakpoint
CREATE INDEX "appraisals_requester_idx" ON "core"."appraisals" USING btree ("requester_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appraisals_converted_property_uq" ON "core"."appraisals" USING btree ("converted_property_id") WHERE converted_property_id is not null;--> statement-breakpoint
CREATE INDEX "client_activities_client_occurred_idx" ON "core"."client_activities" USING btree ("client_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "client_activities_opportunity_occurred_idx" ON "core"."client_activities" USING btree ("opportunity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "client_emails_client_idx" ON "core"."client_emails" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_emails_email_idx" ON "core"."client_emails" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "client_phones_client_idx" ON "core"."client_phones" USING btree ("client_id","position");--> statement-breakpoint
CREATE INDEX "client_phones_match_key_idx" ON "core"."client_phones" USING btree ("phone_match_key");--> statement-breakpoint
CREATE INDEX "client_relations_related_idx" ON "core"."client_relations" USING btree ("related_client_id");--> statement-breakpoint
CREATE INDEX "client_tag_assignments_tag_idx" ON "core"."client_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_tags_group_name_uq" ON "core"."client_tags" USING btree (coalesce("group_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "featured_listings_client_property_uq" ON "core"."featured_listings" USING btree ("client_id","property_id") WHERE removed_at is null;--> statement-breakpoint
CREATE INDEX "featured_listings_property_idx" ON "core"."featured_listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "featured_listings_client_featured_idx" ON "core"."featured_listings" USING btree ("client_id","featured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_channel_external_uq" ON "core"."inquiries" USING btree ("channel","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE INDEX "inquiries_status_received_idx" ON "core"."inquiries" USING btree ("status","received_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "inquiries_agent_received_idx" ON "core"."inquiries" USING btree ("assigned_agent_id","received_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "inquiries_channel_received_idx" ON "core"."inquiries" USING btree ("channel","received_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "inquiries_sender_phone_idx" ON "core"."inquiries" USING btree ("sender_phone_match_key");--> statement-breakpoint
CREATE INDEX "inquiries_sender_email_idx" ON "core"."inquiries" USING btree (lower("sender_email"));--> statement-breakpoint
CREATE INDEX "inquiries_client_idx" ON "core"."inquiries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "inquiries_property_idx" ON "core"."inquiries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "inquiries_development_idx" ON "core"."inquiries" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "inquiry_assignment_rule_agents_user_idx" ON "core"."inquiry_assignment_rule_agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inquiry_assignment_rules_active_position_idx" ON "core"."inquiry_assignment_rules" USING btree ("is_active","position");--> statement-breakpoint
CREATE INDEX "opportunity_close_reasons_position_idx" ON "core"."opportunity_close_reasons" USING btree ("position");--> statement-breakpoint
CREATE INDEX "opportunity_stages_category_position_idx" ON "core"."opportunity_stages" USING btree ("category","position");--> statement-breakpoint
CREATE INDEX "opportunity_status_changes_opportunity_idx" ON "core"."opportunity_status_changes" USING btree ("opportunity_id","changed_at");--> statement-breakpoint
CREATE INDEX "opportunity_status_changes_to_status_idx" ON "core"."opportunity_status_changes" USING btree ("to_status","changed_at");--> statement-breakpoint
CREATE INDEX "quick_replies_active_position_idx" ON "core"."quick_replies" USING btree ("is_active","position");--> statement-breakpoint
CREATE INDEX "saved_searches_client_idx" ON "core"."saved_searches" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "saved_searches_matching_idx" ON "core"."saved_searches" USING btree ("operation","currency") WHERE auto_send and deleted_at is null;--> statement-breakpoint
CREATE INDEX "saved_searches_location_ids_idx" ON "core"."saved_searches" USING gin ("location_ids");--> statement-breakpoint
CREATE INDEX "saved_searches_updated_idx" ON "core"."saved_searches" USING btree ("updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "shared_listing_items_property_idx" ON "core"."shared_listing_items" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_listings_token_hash_uq" ON "core"."shared_listings" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "shared_listings_client_sent_idx" ON "core"."shared_listings" USING btree ("client_id","sent_at");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "core"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_uq" ON "core"."accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_name_uq" ON "core"."branches" USING btree ("name") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_uq" ON "core"."roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "core"."sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "core"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "core"."team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_branch_idx" ON "core"."teams" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "user_favorites_user_created_idx" ON "core"."user_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_favorites_entity_idx" ON "core"."user_favorites" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "core"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_name_idx" ON "core"."users" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX "users_branch_idx" ON "core"."users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "core"."verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "core"."notifications" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_pinned_idx" ON "core"."notifications" USING btree ("user_id","pinned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_source_event_user_uq" ON "core"."notifications" USING btree ("source_event_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "core"."notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "erasure_records_executed_idx" ON "core"."erasure_records" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "erasure_records_entity_idx" ON "core"."erasure_records" USING btree ("erased_entity_type","erased_entity_id");--> statement-breakpoint
CREATE INDEX "import_job_errors_job_row_idx" ON "core"."import_job_errors" USING btree ("job_id","row_number");--> statement-breakpoint
CREATE INDEX "import_jobs_kind_created_idx" ON "core"."import_jobs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_external_uq" ON "core"."import_mappings" USING btree ("source","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "import_mappings_internal_idx" ON "core"."import_mappings" USING btree ("entity_type","internal_id");--> statement-breakpoint
CREATE INDEX "portal_listing_daily_stats_date_idx" ON "core"."portal_listing_daily_stats" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_portal_property_uq" ON "core"."portal_listings" USING btree ("portal","property_id") WHERE property_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_portal_development_uq" ON "core"."portal_listings" USING btree ("portal","development_id") WHERE development_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_portal_external_uq" ON "core"."portal_listings" USING btree ("portal","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE INDEX "portal_listings_portal_status_idx" ON "core"."portal_listings" USING btree ("portal","status");--> statement-breakpoint
CREATE INDEX "portal_listings_property_idx" ON "core"."portal_listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "portal_listings_development_idx" ON "core"."portal_listings" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "attachments_property_created_idx" ON "core"."attachments" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_development_created_idx" ON "core"."attachments" USING btree ("development_id","created_at");--> statement-breakpoint
CREATE INDEX "development_features_feature_idx" ON "core"."development_features" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "development_tag_assignments_tag_idx" ON "core"."development_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developments_code_uq" ON "core"."developments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "developments_slug_uq" ON "core"."developments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "developments_status_updated_idx" ON "core"."developments" USING btree ("status","updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_name_idx" ON "core"."developments" USING btree ("name") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_delivery_date_idx" ON "core"."developments" USING btree ("delivery_date") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_location_idx" ON "core"."developments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "developments_coordinates_idx" ON "core"."developments" USING btree ("latitude","longitude") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "developments_commercial_contact_idx" ON "core"."developments" USING btree ("commercial_contact_client_id");--> statement-breakpoint
CREATE INDEX "developments_search_text_idx" ON "core"."developments" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "features_key_uq" ON "core"."features" USING btree ("key");--> statement-breakpoint
CREATE INDEX "features_kind_position_idx" ON "core"."features" USING btree ("kind","position");--> statement-breakpoint
CREATE INDEX "locations_parent_idx" ON "core"."locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "locations_path_idx" ON "core"."locations" USING btree ("path" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "locations_normalized_name_idx" ON "core"."locations" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_items_property_position_idx" ON "core"."media_items" USING btree ("property_id","position");--> statement-breakpoint
CREATE INDEX "media_items_development_position_idx" ON "core"."media_items" USING btree ("development_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_property_cover_uq" ON "core"."media_items" USING btree ("property_id") WHERE is_cover and property_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_development_cover_uq" ON "core"."media_items" USING btree ("development_id") WHERE is_cover and development_id is not null;--> statement-breakpoint
CREATE INDEX "property_appraisers_user_idx" ON "core"."property_appraisers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "property_custom_attribute_values_text_idx" ON "core"."property_custom_attribute_values" USING btree ("attribute_id","value_text");--> statement-breakpoint
CREATE INDEX "property_features_feature_idx" ON "core"."property_features" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_operations_property_operation_uq" ON "core"."property_operations" USING btree ("property_id","operation");--> statement-breakpoint
CREATE INDEX "property_operations_price_idx" ON "core"."property_operations" USING btree ("operation","currency","price_cents");--> statement-breakpoint
CREATE INDEX "property_owners_client_idx" ON "core"."property_owners" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "property_price_changes_property_idx" ON "core"."property_price_changes" USING btree ("property_id","changed_at");--> statement-breakpoint
CREATE INDEX "property_price_changes_changed_idx" ON "core"."property_price_changes" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "property_tag_assignments_tag_idx" ON "core"."property_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_tags_group_name_uq" ON "core"."property_tags" USING btree (coalesce("group_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_active_property_uq" ON "core"."reservations" USING btree ("property_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "reservations_status_signing_idx" ON "core"."reservations" USING btree ("status","estimated_signing_date");--> statement-breakpoint
CREATE INDEX "reservations_agent_reserved_idx" ON "core"."reservations" USING btree ("agent_user_id","reserved_at");--> statement-breakpoint
CREATE INDEX "reservations_manager_reserved_idx" ON "core"."reservations" USING btree ("manager_user_id","reserved_at");--> statement-breakpoint
CREATE INDEX "reservations_branch_reserved_idx" ON "core"."reservations" USING btree ("branch_id","reserved_at");--> statement-breakpoint
CREATE INDEX "reservations_created_idx" ON "core"."reservations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reservations_client_idx" ON "core"."reservations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "company_files_folder_name_idx" ON "core"."company_files" USING btree ("folder_id","name") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_parent_name_uq" ON "core"."file_folders" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),"name");--> statement-breakpoint
CREATE INDEX "file_folders_path_idx" ON "core"."file_folders" USING btree ("path" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "reference_code_sequences_scope_uq" ON "core"."reference_code_sequences" USING btree ("scope","scope_value");--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD CONSTRAINT "opportunities_stage_id_opportunity_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "core"."opportunity_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."opportunities" ADD CONSTRAINT "opportunities_close_reason_id_opportunity_close_reasons_id_fk" FOREIGN KEY ("close_reason_id") REFERENCES "core"."opportunity_close_reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD CONSTRAINT "properties_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."properties" ADD CONSTRAINT "properties_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "core"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_agent_updated_idx" ON "core"."clients" USING btree ("agent_id","updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_kind_name_idx" ON "core"."clients" USING btree ("kind","name") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_name_lower_idx" ON "core"."clients" USING btree (lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_created_idx" ON "core"."clients" USING btree ("created_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_updated_idx" ON "core"."clients" USING btree ("updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_branch_idx" ON "core"."clients" USING btree ("branch_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "clients_client_types_idx" ON "core"."clients" USING gin ("client_types");--> statement-breakpoint
CREATE INDEX "clients_search_text_idx" ON "core"."clients" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_deleted_idx" ON "core"."clients" USING btree ("deleted_at") WHERE deleted_at is not null;--> statement-breakpoint
CREATE INDEX "opportunities_agent_status_updated_idx" ON "core"."opportunities" USING btree ("agent_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "opportunities_stage_status_changed_idx" ON "core"."opportunities" USING btree ("stage_id","status_changed_at");--> statement-breakpoint
CREATE INDEX "opportunities_status_last_activity_idx" ON "core"."opportunities" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "opportunities_property_idx" ON "core"."opportunities" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "opportunities_development_idx" ON "core"."opportunities" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "opportunities_branch_status_idx" ON "core"."opportunities" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_origin_channel_created_idx" ON "core"."opportunities" USING btree ("origin_channel","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_occurred_idx" ON "core"."audit_log" USING btree ("entity_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_client_ids_idx" ON "core"."audit_log" USING gin ("client_ids");--> statement-breakpoint
CREATE INDEX "audit_log_correlation_idx" ON "core"."audit_log" USING btree ("correlation_id") WHERE correlation_id is not null;--> statement-breakpoint
CREATE INDEX "properties_status_updated_idx" ON "core"."properties" USING btree ("status","updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "properties_created_idx" ON "core"."properties" USING btree ("created_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "properties_type_status_idx" ON "core"."properties" USING btree ("property_type","status") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "properties_producer_status_idx" ON "core"."properties" USING btree ("producer_user_id","status");--> statement-breakpoint
CREATE INDEX "properties_branch_status_idx" ON "core"."properties" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "properties_development_idx" ON "core"."properties" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "properties_location_idx" ON "core"."properties" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "properties_coordinates_idx" ON "core"."properties" USING btree ("latitude","longitude") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "properties_search_text_idx" ON "core"."properties" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "properties_deleted_idx" ON "core"."properties" USING btree ("deleted_at") WHERE deleted_at is not null;--> statement-breakpoint
-- Filas únicas de configuración, con los valores por defecto.
INSERT INTO "core"."company_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."opportunity_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."inquiry_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."follow_up_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."property_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."reservation_settings" ("created_at", "updated_at", "created_by", "updated_by") VALUES (now(), now(), 'system:import', 'system:import') ON CONFLICT DO NOTHING;
