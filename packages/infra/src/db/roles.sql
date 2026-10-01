-- Roles de base de datos del esquema `core` (mínimo privilegio). Ver docs/arquitectura.md §10.
--
-- Idempotente: se aplica después de cada migración (`pnpm db:roles`, `pnpm db:setup` y el setup
-- de los tests de integración), con el dueño de la base. Crear los roles requiere CREATEROLE
-- (o superusuario); el resto, ser dueño de las tablas.
--
-- - norde_app: el rol de los procesos (web, agent, gestion). Cada uno se conecta con un usuario
--   de login propio que es miembro de este rol, nunca con el dueño de la base.
-- - norde_erasure: lo mismo que norde_app, más borrar entradas de `audit_log`. Solo para la
--   supresión de datos de un cliente (Ley 25.326).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'norde_app') THEN
    CREATE ROLE norde_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'norde_erasure') THEN
    CREATE ROLE norde_erasure NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA core TO norde_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO norde_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO norde_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO norde_app;

-- Las tablas que creen las migraciones futuras quedan con los mismos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO norde_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT USAGE, SELECT ON SEQUENCES TO norde_app;

-- Las migraciones son del dueño de la base, no de los procesos.
REVOKE ALL ON core.__drizzle_migrations FROM norde_app;

-- El historial de cambios es solo de inserción.
REVOKE UPDATE, DELETE, TRUNCATE ON core.audit_log FROM norde_app;

-- La supresión de datos borra también el historial del cliente.
GRANT norde_app TO norde_erasure;
GRANT DELETE ON core.audit_log TO norde_erasure;
