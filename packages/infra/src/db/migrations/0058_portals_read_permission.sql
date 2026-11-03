-- Portales: permiso para ver la difusión sin publicar (la pestaña Difusión, el resumen y las
-- cuentas conectadas). Lo tienen el administrador, el gerente y el agente. Idempotente.
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'portals:read'),
  ('manager', 'portals:read'),
  ('agent', 'portals:read')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;
