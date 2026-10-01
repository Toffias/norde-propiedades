-- Idempotente (`IF NOT EXISTS`): las bases de desarrollo que aplicaron la primera versión de esta
-- migración (numerada 0003 antes del merge con #3) ya tienen estas columnas e índices.
ALTER TABLE "core"."company_settings" ADD COLUMN IF NOT EXISTS "logo_storage_key" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_files_folder_updated_idx" ON "core"."company_files" USING btree ("folder_id","updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_files_folder_size_idx" ON "core"."company_files" USING btree ("folder_id","size_bytes") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_files_trash_deleted_idx" ON "core"."company_files" USING btree ("deleted_at") WHERE deleted_at is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_files_trash_name_idx" ON "core"."company_files" USING btree ("name") WHERE deleted_at is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_folders_parent_name_idx" ON "core"."file_folders" USING btree ("parent_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_folders_parent_updated_idx" ON "core"."file_folders" USING btree ("parent_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reference_code_sequences_prefix_uq" ON "core"."reference_code_sequences" USING btree ("prefix");--> statement-breakpoint
-- Gestor de archivos de la empresa (#4): permiso propio, separado de la configuración (`settings:*`).
-- Administrador: todo. Gerente y agente: ver, descargar y subir. Idempotente.
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'company-files:*'),
  ('manager', 'company-files:read'), ('manager', 'company-files:upload'),
  ('agent', 'company-files:read'), ('agent', 'company-files:upload')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;--> statement-breakpoint
-- Numeración global de códigos de referencia: siempre tiene que existir una que aplique.
INSERT INTO "core"."reference_code_sequences" ("id", "scope", "scope_value", "prefix", "next_number", "created_at", "updated_at", "created_by", "updated_by")
VALUES ('01920000-0000-7000-8000-0000000000c1', 'global', '', 'P', 1, now(), now(), 'system:import', 'system:import')
ON CONFLICT DO NOTHING;
