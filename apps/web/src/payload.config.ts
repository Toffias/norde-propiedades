import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { es } from '@payloadcms/translations/languages/es';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { getEnv } from './config/env';
import { Categories } from './payload/collections/categories';
import { Media } from './payload/collections/media';
import { Posts } from './payload/collections/posts';
import { Users } from './payload/collections/users';
import { plugins } from './payload/plugins';

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
    livePreview: {
      collections: [Posts.slug],
      breakpoints: [
        { name: 'mobile', label: 'Mobile', width: 375, height: 667 },
        { name: 'tablet', label: 'Tablet', width: 768, height: 1024 },
        { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      ],
    },
  },
  i18n: { supportedLanguages: { es }, fallbackLanguage: 'es' },
  collections: [Posts, Categories, Media, Users],
  plugins,
  // Ejecuta la cola de jobs (publicación programada de posts). El sitio corre en un VPS
  // con un proceso de larga duración (PM2), no en serverless.
  jobs: { autoRun: [{ cron: '* * * * *', queue: 'default', limit: 10 }] },
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
