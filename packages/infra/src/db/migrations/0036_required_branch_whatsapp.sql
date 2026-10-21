-- El WhatsApp de la sucursal y la sucursal del usuario pasan a ser obligatorios. Antes se rellenan
-- los vacíos (y se audita como `system:import`): las sucursales sin WhatsApp toman su teléfono y
-- los usuarios sin sucursal van a la casa central. Si algo no se puede rellenar, la migración
-- frena con un mensaje: hay que cargar el dato a mano y volver a migrar.
--
-- `uuidv7()` es nativa recién en PostgreSQL 18 y el proyecto usa 17 (ADR 0041): se arma con una
-- función temporal de la sesión (milisegundos de la época + bits aleatorios, versión 7).

CREATE FUNCTION pg_temp.uuidv7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
    52, 1), 53, 1),
  'hex')::uuid
$$;--> statement-breakpoint

INSERT INTO "core"."audit_log" ("id", "actor_id", "action", "entity_type", "entity_id", "changes", "source", "occurred_at")
SELECT pg_temp.uuidv7(), 'system:import', 'branch.updated', 'branch', b."id"::text,
  jsonb_build_object('whatsapp', jsonb_build_object('before', NULL, 'after', b."phone_e164")),
  'import', now()
FROM "core"."branches" b
WHERE b."whatsapp_e164" IS NULL AND b."phone_e164" IS NOT NULL;--> statement-breakpoint

UPDATE "core"."branches"
SET "whatsapp_e164" = "phone_e164", "updated_at" = now(), "updated_by" = 'system:import'
WHERE "whatsapp_e164" IS NULL AND "phone_e164" IS NOT NULL;--> statement-breakpoint

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg("name", ', ' ORDER BY "name") INTO missing
  FROM "core"."branches" WHERE "whatsapp_e164" IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Sucursales sin WhatsApp ni teléfono: %. Cargales el WhatsApp y volvé a migrar.', missing;
  END IF;

  IF EXISTS (SELECT 1 FROM "core"."users" WHERE "branch_id" IS NULL)
    AND NOT EXISTS (SELECT 1 FROM "core"."branches" WHERE "is_main" AND "deleted_at" IS NULL) THEN
    RAISE EXCEPTION 'Hay usuarios sin sucursal y no existe la casa central. Creala y volvé a migrar.';
  END IF;
END $$;--> statement-breakpoint

INSERT INTO "core"."audit_log" ("id", "actor_id", "action", "entity_type", "entity_id", "changes", "source", "occurred_at")
SELECT pg_temp.uuidv7(), 'system:import', 'user.updated', 'user', u."id"::text,
  jsonb_build_object('branchId', jsonb_build_object('before', NULL, 'after', m."id")),
  'import', now()
FROM "core"."users" u
CROSS JOIN (
  SELECT "id" FROM "core"."branches" WHERE "is_main" AND "deleted_at" IS NULL LIMIT 1
) m
WHERE u."branch_id" IS NULL;--> statement-breakpoint

UPDATE "core"."users"
SET "branch_id" = (
    SELECT "id" FROM "core"."branches" WHERE "is_main" AND "deleted_at" IS NULL LIMIT 1
  ),
  "updated_at" = now(), "updated_by" = 'system:import'
WHERE "branch_id" IS NULL;--> statement-breakpoint

ALTER TABLE "core"."branches" ALTER COLUMN "whatsapp_e164" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."users" ALTER COLUMN "branch_id" SET NOT NULL;
