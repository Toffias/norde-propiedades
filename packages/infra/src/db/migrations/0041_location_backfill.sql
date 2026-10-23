-- Las propiedades sin ubicación del catálogo (cargadas antes del catálogo o con el texto a mano)
-- la toman de su barrio o, si no, de su localidad, cuando el texto coincide sin acentos ni
-- mayúsculas con UNA sola ubicación: el barrio dentro de esa localidad, la localidad dentro de esa
-- provincia. Los textos no se tocan. Lo ambiguo o sin coincidencia queda como estaba, para
-- cargarlo a mano en la ficha. Se audita como `system:import`. Solo expand; idempotente.
--
-- `uuidv7()` es nativa recién en PostgreSQL 18 y el proyecto usa 17 (ADR 0041): se arma con una
-- función temporal de la sesión, como en 0036.

CREATE OR REPLACE FUNCTION pg_temp.uuidv7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
    52, 1), 53, 1),
  'hex')::uuid
$$;--> statement-breakpoint

CREATE TEMP TABLE "location_backfill" AS
WITH "pending" AS (
  SELECT p."id",
    core.search_normalize(trim(p."neighborhood")) AS "neighborhood",
    core.search_normalize(trim(p."city")) AS "city",
    core.search_normalize(trim(p."province")) AS "province"
  FROM "core"."properties" p
  WHERE p."location_id" IS NULL
),
"by_neighborhood" AS (
  SELECT pe."id" AS "property_id", min(l."id"::text)::uuid AS "location_id"
  FROM "pending" pe
  JOIN "core"."locations" l
    ON l."kind" IN ('neighborhood', 'subneighborhood') AND l."normalized_name" = pe."neighborhood"
  WHERE pe."neighborhood" <> ''
    AND (pe."city" = '' OR EXISTS (
      SELECT 1 FROM "core"."locations" a
      WHERE a."kind" = 'city' AND a."normalized_name" = pe."city"
        AND l."path" LIKE '%/' || a."id" || '/%'
    ))
  GROUP BY pe."id"
  HAVING count(*) = 1
),
"by_city" AS (
  SELECT pe."id" AS "property_id", min(l."id"::text)::uuid AS "location_id"
  FROM "pending" pe
  JOIN "core"."locations" l ON l."kind" = 'city' AND l."normalized_name" = pe."city"
  WHERE pe."city" <> ''
    AND (pe."province" = '' OR EXISTS (
      SELECT 1 FROM "core"."locations" a
      WHERE a."kind" = 'province' AND a."normalized_name" = pe."province"
        AND l."path" LIKE '%/' || a."id" || '/%'
    ))
  GROUP BY pe."id"
  HAVING count(*) = 1
)
SELECT pe."id" AS "property_id", coalesce(bn."location_id", bc."location_id") AS "location_id"
FROM "pending" pe
LEFT JOIN "by_neighborhood" bn ON bn."property_id" = pe."id"
LEFT JOIN "by_city" bc ON bc."property_id" = pe."id"
WHERE coalesce(bn."location_id", bc."location_id") IS NOT NULL;--> statement-breakpoint

INSERT INTO "core"."audit_log" ("id", "actor_id", "action", "entity_type", "entity_id", "changes", "source", "occurred_at")
SELECT pg_temp.uuidv7(), 'system:import', 'property.updated', 'property', b."property_id"::text,
  jsonb_build_object('locationId', jsonb_build_object('before', NULL, 'after', b."location_id")),
  'import', now()
FROM "location_backfill" b;--> statement-breakpoint

UPDATE "core"."properties" p
SET "location_id" = b."location_id", "updated_at" = now(), "updated_by" = 'system:import'
FROM "location_backfill" b
WHERE p."id" = b."property_id";--> statement-breakpoint

DROP TABLE "location_backfill";
