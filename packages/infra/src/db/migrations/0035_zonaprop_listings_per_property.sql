-- Zonaprop publica un aviso por propiedad con todas sus operaciones (#14, etapa 2 de Zonaprop).
-- Compatible hacia atrás: la versión anterior siempre escribe la operación, y la columna `plan`
-- es opcional. El índice nuevo reemplaza al CHECK para los avisos sin operación.
ALTER TABLE "core"."portal_listings" DROP CONSTRAINT "portal_listings_property_operation";--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD COLUMN "plan" text;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_portal_property_whole_uq" ON "core"."portal_listings" USING btree ("portal","property_id") WHERE property_id is not null and operation is null;