import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';

import type * as schema from './schema';

/**
 * Lo que necesita un repositorio para consultar: la base o una transacción abierta.
 * Los repositorios no abren transacciones propias; las abre el `UnitOfWork`.
 */
export type DbExecutor = PgDatabase<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
