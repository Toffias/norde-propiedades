-- Recursos que sumó el catálogo de permisos (#3) y que los roles de sistema todavía no tenían:
-- seguimientos, archivos, respuestas rápidas y etiquetas (los de Gerencia y Marketing en Tokko) y
-- equipos. El administrador los tiene todos; el gerente, todos menos administrar equipos. Los demás
-- roles no cambian. Se ajustan desde el ABM de roles. Idempotente.
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'followups:*'), ('admin', 'files:*'), ('admin', 'quick-replies:*'),
  ('admin', 'tags:*'), ('admin', 'teams:*'),
  ('manager', 'followups:*'), ('manager', 'files:*'), ('manager', 'quick-replies:*'),
  ('manager', 'tags:*'), ('manager', 'teams:read')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;
