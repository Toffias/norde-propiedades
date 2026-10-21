-- Las fotos guardan la importación que las trajo: la campana de Notificaciones sigue sus variantes
-- como una sola tarea, a nombre de quien pidió la importación.
--
-- Las que ya trajo una importación de Tokko por API (subidas por `system:import`) se vinculan a la
-- que estaba corriendo cuando se crearon. Es un dato técnico, no de negocio: no se audita ni toca
-- `updated_at`.

ALTER TABLE "core"."media_items" ADD COLUMN "import_id" uuid;--> statement-breakpoint
CREATE INDEX "media_items_import_idx" ON "core"."media_items" USING btree ("import_id") WHERE import_id is not null;--> statement-breakpoint

UPDATE "core"."media_items" m
SET "import_id" = j."id"
FROM "core"."import_jobs" j
WHERE m."uploaded_by" = 'system:import'
  AND m."import_id" IS NULL
  AND m."kind" IN ('photo', 'floor_plan')
  AND j."kind" = 'properties_tokko'
  AND j."options" ->> 'source' = 'api'
  AND j."started_at" IS NOT NULL
  AND m."created_at" >= j."started_at"
  AND (j."finished_at" IS NULL OR m."created_at" <= j."finished_at");
