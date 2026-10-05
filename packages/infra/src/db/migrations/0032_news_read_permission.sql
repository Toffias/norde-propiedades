-- Noticias (#16): permiso propio para ver el feed de actividad de la empresa. Lo tienen el
-- administrador, el gerente y el agente. Idempotente.
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'news:read'),
  ('manager', 'news:read'),
  ('agent', 'news:read')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;
