-- #6 ficha de propiedad: PDF pedidos desde la ficha (ficha, vidriera, reporte al propietario), con su
-- estado mientras los arma el job (ADR 0020), e índice de los interesados de una propiedad. Solo
-- expand. Idempotente.
CREATE TABLE IF NOT EXISTS "core"."property_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL CONSTRAINT "property_documents_property_id_properties_id_fk" REFERENCES "core"."properties"("id") ON DELETE cascade ON UPDATE no action,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"period_from" date,
	"period_to" date,
	"storage_key" text,
	"error" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_documents_property_created_idx" ON "core"."property_documents" USING btree ("property_id","created_at","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_searches_operation_updated_idx" ON "core"."saved_searches" USING btree ("operation","updated_at","id") WHERE deleted_at is null and unsubscribed_at is null;
