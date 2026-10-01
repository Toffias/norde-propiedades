-- Rol y bases para desarrollo LOCAL. Nunca usar estas credenciales en otro entorno.
-- Se corre una sola vez, como superusuario:
--   psql -U postgres -h localhost -f scripts/db/create-dev-database.sql

-- CREATEROLE: `pnpm db:setup` crea los roles norde_app y norde_erasure (packages/infra/src/db/roles.sql).
CREATE ROLE norde WITH LOGIN CREATEROLE PASSWORD 'norde';

-- Base de desarrollo (web, gestión y agente comparten la misma base)
CREATE DATABASE norde OWNER norde;

-- Base para tests de integración
CREATE DATABASE norde_test OWNER norde;
