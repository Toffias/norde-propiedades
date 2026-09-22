import { defineConfig } from 'drizzle-kit';

// Configuración del CLI de drizzle-kit (no es código de la app).
// `db:migrate` necesita DATABASE_URL; `db:generate` no se conecta a la base.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  schemaFilter: ['core'],
  migrations: { schema: 'core', table: '__drizzle_migrations' },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
