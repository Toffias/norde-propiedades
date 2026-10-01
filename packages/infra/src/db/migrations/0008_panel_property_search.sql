-- Buscador de propiedades del panel (#5). Solo expand: índices nuevos. Idempotente.
CREATE INDEX IF NOT EXISTS "properties_updated_idx" ON "core"."properties" USING btree ("updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_location_text_idx" ON "core"."properties" USING gin (core.search_normalize("neighborhood" || ' ' || "city" || ' ' || "province") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_operations_property_currency_idx" ON "core"."property_operations" USING btree ("property_id","currency","price_cents");