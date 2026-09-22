import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { es } from '@payloadcms/translations/languages/es';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { getEnv } from './config/env';
import { Media } from './payload/collections/media';
import { Users } from './payload/collections/users';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = getEnv();

// Payload: SOLO contenido editorial (blog, páginas, header/footer). El negocio vive en @norde/core.
export default buildConfig({
  secret: env.PAYLOAD_SECRET,
  serverURL: env.NEXT_PUBLIC_SERVER_URL,
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    meta: { titleSuffix: ' · Norde Propiedades' },
  },
  i18n: { supportedLanguages: { es }, fallbackLanguage: 'es' },
  collections: [Users, Media],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URL, application_name: 'norde-web-payload' },
    schemaName: 'payload',
    migrationDir: path.resolve(dirname, 'migrations'),
    // Sin "push" automático, ni siquiera en desarrollo: todo cambio de esquema pasa por una
    // migración versionada (evita el desfasaje dev/prod que tuvo DS-DESIGN-Landing).
    push: false,
  }),
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  telemetry: false,
});
