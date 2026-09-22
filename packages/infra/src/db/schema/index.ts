import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Esquema de Postgres de los datos de negocio. Payload usa `payload` y pg-boss usa `pgboss`.
 * Cada módulo del core agrega sus tablas en un archivo propio de esta carpeta
 * (ej. `properties.ts`) y se re-exporta acá.
 */
export const coreSchema = pgSchema('core');
