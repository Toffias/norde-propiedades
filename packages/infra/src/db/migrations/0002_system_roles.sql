-- Roles de sistema del panel (docs/modulos/03-sistema-gestion.md §2.1, a validar con Norde).
-- Son el punto de partida: los permisos se ajustan desde el ABM de roles (#3) sin tocar código.
-- Los roles de sistema no se borran ni se renombran (`is_system`). Idempotente.
INSERT INTO "core"."roles" ("id", "key", "name", "description", "is_system", "created_at", "updated_at", "created_by", "updated_by") VALUES
  ('01920000-0000-7000-8000-000000000001', 'admin', 'Administrador', 'Todo, incluida la gestión de usuarios, la configuración, las integraciones y los reportes', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000002', 'manager', 'Gerente / Broker', 'Ve y edita todo, reasigna clientes y ve reportes. No gestiona usuarios ni roles', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000003', 'agent', 'Agente / Asesor', 'Ve todas las propiedades y gestiona sus clientes, oportunidades y conversaciones', true, now(), now(), 'system:import', 'system:import'),
  ('01920000-0000-7000-8000-000000000004', 'rentals-admin', 'Administrativo de alquileres', 'Contratos de alquiler, propietarios, inquilinos y actualizaciones', true, now(), now(), 'system:import', 'system:import')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", p."permission", now(), 'system:import'
FROM (VALUES
  ('admin', 'clients:*'), ('admin', 'opportunities:*'), ('admin', 'inquiries:*'),
  ('admin', 'properties:*'), ('admin', 'developments:*'), ('admin', 'appraisals:*'),
  ('admin', 'reservations:*'), ('admin', 'rentals:*'), ('admin', 'portals:*'),
  ('admin', 'conversations:*'), ('admin', 'notifications:*'), ('admin', 'audit:*'),
  ('admin', 'reports:*'), ('admin', 'settings:*'), ('admin', 'branches:*'),
  ('admin', 'users:*'), ('admin', 'roles:*'),
  ('manager', 'clients:*'), ('manager', 'opportunities:*'), ('manager', 'inquiries:*'),
  ('manager', 'properties:*'), ('manager', 'developments:*'), ('manager', 'appraisals:*'),
  ('manager', 'reservations:*'), ('manager', 'rentals:*'), ('manager', 'portals:*'),
  ('manager', 'conversations:*'), ('manager', 'notifications:*'), ('manager', 'audit:read'),
  ('manager', 'reports:*'), ('manager', 'branches:read'), ('manager', 'users:read'),
  ('agent', 'clients:read'), ('agent', 'clients:create'), ('agent', 'clients:update'),
  ('agent', 'opportunities:read'), ('agent', 'opportunities:create'), ('agent', 'opportunities:update'),
  ('agent', 'inquiries:read'), ('agent', 'inquiries:update'),
  ('agent', 'properties:read'), ('agent', 'properties:create'), ('agent', 'properties:update'),
  ('agent', 'developments:read'), ('agent', 'appraisals:read'), ('agent', 'appraisals:create'),
  ('agent', 'appraisals:update'), ('agent', 'reservations:read'), ('agent', 'reservations:create'),
  ('agent', 'conversations:*'), ('agent', 'notifications:read'), ('agent', 'users:read'),
  ('rentals-admin', 'rentals:*'), ('rentals-admin', 'clients:read'), ('rentals-admin', 'clients:create'),
  ('rentals-admin', 'clients:update'), ('rentals-admin', 'properties:read'),
  ('rentals-admin', 'notifications:read'), ('rentals-admin', 'users:read')
) AS p("role_key", "permission")
JOIN "core"."roles" r ON r."key" = p."role_key"
ON CONFLICT ("role_id", "permission") DO NOTHING;
