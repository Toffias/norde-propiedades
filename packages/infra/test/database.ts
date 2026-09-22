// Conexión compartida por los tests de integración de un archivo.

import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, inject } from 'vitest';

import { createDatabase } from '../src/db/client';

/** Abre la base de tests y la vacía antes de cada test. */
export function useTestDatabase() {
  const connection = createDatabase({
    url: inject('databaseUrl'),
    applicationName: 'norde-infra-tests',
    maxConnections: 4,
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      drop schema if exists pgboss_test cascade;
      truncate core.properties, core.clients, core.client_channels, core.opportunities,
        core.conversations, core.conversation_messages, core.outbox, core.audit_log
    `);
  });

  afterAll(() => connection.close());

  return connection.db;
}
