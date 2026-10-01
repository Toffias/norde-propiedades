-- #6 ficha de propiedad: estado de las variantes de cada foto (las genera un job, ADR 0020) y orden
-- por nombre de los archivos. Solo expand. Idempotente.
ALTER TABLE "core"."media_items" ADD COLUMN IF NOT EXISTS "content_type" text;--> statement-breakpoint
ALTER TABLE "core"."media_items" ADD COLUMN IF NOT EXISTS "processing_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."media_items" ADD COLUMN IF NOT EXISTS "processing_error" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_property_name_idx" ON "core"."attachments" USING btree ("property_id","name","id") WHERE deleted_at is null;
