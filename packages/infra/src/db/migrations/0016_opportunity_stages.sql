-- Estados editables de oportunidad (ADR 0013, #9): seed y backfill. Expand: no borra ni renombra
-- columnas. Idempotente.

-- Un estado por categoría. Norde los renombra, recolorea, ordena o agrega desde Mi empresa.
INSERT INTO "core"."opportunity_stages" ("id", "name", "color", "position", "category", "is_active", "created_at", "updated_at", "created_by", "updated_by") VALUES
  ('01920000-0000-7000-8000-000000000101', 'Nuevo', '#3b82f6', 0, 'new', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000102', 'Contactado', '#06b6d4', 1, 'contacted', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000103', 'Visitando', '#8b5cf6', 2, 'visiting', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000104', 'Negociando', '#f59e0b', 3, 'negotiating', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000105', 'Ganada', '#22c55e', 4, 'won', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000106', 'Perdida', '#ef4444', 5, 'lost', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000107', 'Aplica a otra inmobiliaria', '#64748b', 6, 'referred_to_partner', true, now(), now(), 'system:import', 'system:import')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- Motivos de cierre de partida (a validar con Norde).
INSERT INTO "core"."opportunity_close_reasons" ("id", "name", "rating", "position", "is_active", "created_at", "updated_at", "created_by", "updated_by") VALUES
  ('01920000-0000-7000-8000-000000000201', 'Compró o alquiló con Norde', 'positive', 0, true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000202', 'Compró o alquiló con otra inmobiliaria', 'negative', 1, true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000203', 'Dejó de buscar', 'negative', 2, true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000204', 'No respondió', 'negative', 3, true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000205', 'Datos incorrectos o duplicado', 'neutral', 4, true, now(), now(), 'system:import', 'system:import')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- Cada oportunidad, en el primer estado de su categoría.
UPDATE "core"."opportunities" o
SET "stage_id" = (
  SELECT s."id" FROM "core"."opportunity_stages" s
  WHERE s."category" = o."status" AND s."is_active"
  ORDER BY s."position", s."id"
  LIMIT 1
)
WHERE o."stage_id" IS NULL;--> statement-breakpoint

-- El agente y la sucursal de la oportunidad, heredados del contacto.
UPDATE "core"."opportunities" o
SET "agent_id" = c."agent_id", "branch_id" = c."branch_id"
FROM "core"."clients" c
WHERE c."id" = o."client_id" AND o."agent_id" IS NULL AND o."branch_id" IS NULL;--> statement-breakpoint

-- Sin historial, la vigencia de "nueva" y "derivada" cuenta desde que se creó; la del resto, desde
-- la última actualización (el mejor dato que hay).
UPDATE "core"."opportunities"
SET "status_changed_at" = CASE
  WHEN "status" IN ('new', 'referred_to_partner') THEN "created_at"
  ELSE "updated_at"
END
WHERE "status_changed_at" IS NULL;--> statement-breakpoint

UPDATE "core"."opportunities"
SET "closed_at" = "status_changed_at"
WHERE "status" IN ('won', 'lost') AND "closed_at" IS NULL;--> statement-breakpoint

-- El estado actual como primera entrada del historial, para las que no tienen ninguna.
INSERT INTO "core"."opportunity_status_changes" ("id", "opportunity_id", "from_stage_id", "to_stage_id", "from_status", "to_status", "changed_by", "changed_at")
SELECT gen_random_uuid(), o."id", NULL, o."stage_id", NULL, o."status", 'system:import', o."status_changed_at"
FROM "core"."opportunities" o
WHERE NOT EXISTS (
  SELECT 1 FROM "core"."opportunity_status_changes" c WHERE c."opportunity_id" = o."id"
);--> statement-breakpoint

-- Las oportunidades nuevas nacen en "Nuevo".
UPDATE "core"."opportunity_settings"
SET "stage_on_create_id" = '01920000-0000-7000-8000-000000000101', "updated_at" = now(), "updated_by" = 'system:import'
WHERE "stage_on_create_id" IS NULL;
