-- Unificaciones anteriores a que los módulos reaccionaran a `clients.clients_merged`: lo que
-- apuntaba a un duplicado pasa al contacto que quedó. Si el que quedó se unificó después a otro,
-- va al último de la cadena. Idempotente: una segunda vez no encuentra nada que mover.
CREATE TEMPORARY TABLE "merged_client_roots" AS
WITH RECURSIVE "chain" ("id", "root", "depth") AS (
  SELECT c."id", c."merged_into_id", 1
  FROM "core"."clients" c
  WHERE c."merged_into_id" IS NOT NULL
  UNION ALL
  SELECT chain."id", c."merged_into_id", chain."depth" + 1
  FROM "chain"
  JOIN "core"."clients" c ON c."id" = chain."root"
  WHERE c."merged_into_id" IS NOT NULL AND chain."depth" < 20
)
SELECT DISTINCT ON ("id") "id", "root"
FROM "chain"
ORDER BY "id", "depth" DESC;--> statement-breakpoint

UPDATE "core"."reservations" r
SET "client_id" = m."root"
FROM "merged_client_roots" m
WHERE r."client_id" = m."id";--> statement-breakpoint

-- Propietarios: la PK es (propiedad, cliente). Si los dos eran dueños, queda la fila del que quedó.
INSERT INTO "core"."property_owners" ("property_id", "client_id", "created_at", "created_by")
SELECT po."property_id", m."root", po."created_at", po."created_by"
FROM "core"."property_owners" po
JOIN "merged_client_roots" m ON m."id" = po."client_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

DELETE FROM "core"."property_owners" po
USING "merged_client_roots" m
WHERE po."client_id" = m."id";--> statement-breakpoint

UPDATE "core"."developments" d
SET "commercial_contact_client_id" = m."root"
FROM "merged_client_roots" m
WHERE d."commercial_contact_client_id" = m."id";--> statement-breakpoint

UPDATE "core"."conversations" c
SET "client_id" = m."root"
FROM "merged_client_roots" m
WHERE c."client_id" = m."id";--> statement-breakpoint

-- Favoritos: la PK es (usuario, tipo, entidad). Quien tenía los dos queda con uno.
INSERT INTO "core"."user_favorites" ("user_id", "entity_type", "entity_id", "created_at")
SELECT f."user_id", 'client', m."root", f."created_at"
FROM "core"."user_favorites" f
JOIN "merged_client_roots" m ON m."id" = f."entity_id"
WHERE f."entity_type" = 'client'
ON CONFLICT DO NOTHING;--> statement-breakpoint

DELETE FROM "core"."user_favorites" f
USING "merged_client_roots" m
WHERE f."entity_type" = 'client' AND f."entity_id" = m."id";--> statement-breakpoint

UPDATE "core"."import_mappings" im
SET "internal_id" = m."root"
FROM "merged_client_roots" m
WHERE im."entity_type" = 'client' AND im."internal_id" = m."id";--> statement-breakpoint

DROP TABLE "merged_client_roots";
