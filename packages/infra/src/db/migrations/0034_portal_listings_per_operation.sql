-- Un aviso por portal, propiedad y operación (#14, etapa 2). Hasta acá ningún código escribía
-- publicaciones, así que la tabla está vacía y cambiar el índice único no rompe nada.
DROP INDEX "core"."portal_listings_portal_property_uq";--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD COLUMN "permalink" text;--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD COLUMN "intent" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_portal_property_operation_uq" ON "core"."portal_listings" USING btree ("portal","property_id","operation") WHERE property_id is not null;--> statement-breakpoint
ALTER TABLE "core"."portal_listings" ADD CONSTRAINT "portal_listings_property_operation" CHECK (property_id is null or operation is not null);