import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Esquema de Postgres de los datos de negocio. Payload usa `payload` y pg-boss usa `pgboss`.
 * Cada módulo del core tiene sus tablas en un archivo propio de esta carpeta.
 */
export const coreSchema = pgSchema('core');
