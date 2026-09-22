import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseOptions {
  readonly url: string;
  /** Identifica al proceso en `pg_stat_activity` (ej. `norde-agent`). */
  readonly applicationName: string;
  readonly maxConnections?: number;
}

export interface DatabaseConnection {
  readonly db: Database;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(options: DatabaseOptions): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString: options.url,
    application_name: options.applicationName,
    max: options.maxConnections ?? 10,
  });

  return {
    db: drizzle(pool, { schema }),
    ping: async () => {
      await pool.query('select 1');
    },
    close: () => pool.end(),
  };
}
