-- #6 ficha de propiedad: nombre único (sin acentos) y orden de los atributos personalizados.
-- Solo expand. Idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS "property_custom_attributes_name_uq" ON "core"."property_custom_attributes" USING btree (core.search_normalize("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_custom_attributes_position_idx" ON "core"."property_custom_attributes" USING btree ("position","id");
