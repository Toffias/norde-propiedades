CREATE TABLE "core"."cash_closings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"period" text NOT NULL,
	"opening_cents" bigint NOT NULL,
	"income_cents" bigint NOT NULL,
	"expense_cents" bigint NOT NULL,
	"closing_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."cash_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"date" date NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"concept" text NOT NULL,
	"notes" text,
	"status" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cash_closings_box_period_uq" ON "core"."cash_closings" USING btree ("box","period");--> statement-breakpoint
CREATE INDEX "cash_movements_box_period_idx" ON "core"."cash_movements" USING btree ("box","period","date","created_at","id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "cash_movements_box_period_created_idx" ON "core"."cash_movements" USING btree ("box","period","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "cash_movements_box_all_period_idx" ON "core"."cash_movements" USING btree ("box","period");--> statement-breakpoint
-- Caja chica (#164): rol de sistema "Control de caja", que opera el mes vigente de las cajas, y la
-- caja completa para el administrador. Idempotente.
INSERT INTO "core"."roles" ("id", "key", "name", "description", "is_system", "created_at", "updated_at", "created_by", "updated_by") VALUES
  ('01920000-0000-7000-8000-000000000005', 'cash-control', 'Control de caja', 'Carga, edita y anula movimientos del mes vigente de las cajas de la oficina, y las exporta', true, now(), now(), 'system:import', 'system:import')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'cash:*'),
  ('cash-control', 'cash:read'), ('cash-control', 'cash:create'), ('cash-control', 'cash:update'),
  ('cash-control', 'cash:void'), ('cash-control', 'cash:export')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;
