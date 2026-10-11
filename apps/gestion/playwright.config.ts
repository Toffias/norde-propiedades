import { readE2eEnv } from '@norde/scripts/e2e-database';
import { defineConfig, devices } from '@playwright/test';

// Tests e2e del panel contra una base propia (`*_e2e`), que `pnpm test:e2e` recrea y carga con el
// seed antes de cada corrida (ver `scripts/db/e2e-reset.ts`). Guía: `e2e/README.md`.

const PORT = 3011;
const BASE_URL = `http://localhost:${String(PORT)}`;
const { ci: CI, server: SERVER, databaseUrl } = readE2eEnv();

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  reporter: CI ? [['github'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'list',
  // En dev cada ruta se compila la primera vez que se pide.
  timeout: SERVER === 'dev' ? 90_000 : 30_000,
  expect: { timeout: SERVER === 'dev' ? 20_000 : 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command:
      SERVER === 'dev'
        ? `pnpm exec next dev --port ${String(PORT)}`
        : `pnpm exec next start --port ${String(PORT)}`,
    url: `${BASE_URL}/ingresar`,
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Next no pisa con el `.env` de la app las variables que ya vienen definidas: las vacías dejan
    // apagadas las integraciones externas (mail, portales, webhooks) aunque el `.env` las tenga.
    env: {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0000',
      BETTER_AUTH_URL: BASE_URL,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: '.storage-e2e',
      LOG_LEVEL: 'warn',
      JOBS_ENABLED: 'true',
      INQUIRY_WEBHOOK_SECRET: 'e2e-only-inquiry-webhook-secret-00000000',
      // Las funciones que Norde no usa quedan apagadas, como en producción (#50).
      INQUIRY_RULES_ENABLED: 'false',
      WATERMARK_ENABLED: 'false',
      REFERENCE_CODES_ENABLED: 'false',
      TEAMS_ENABLED: 'false',
      CUSTOM_ATTRIBUTES_ENABLED: 'false',
      PORTALS_ENABLED: 'false',
      // Sin servicios externos: un geocodificador que no responde y ninguna credencial.
      GEOCODER_URL: 'http://127.0.0.1:9',
      RESEND_API_KEY: '',
      MAIL_FROM_ADDRESS: '',
      TEAM_WEBHOOK_URL: '',
      TEAM_WEBHOOK_TOKEN: '',
      WEB_REVALIDATE_URL: '',
      WEB_REVALIDATE_SECRET: '',
      PORTALS_SECRET_KEY: '',
      MERCADOLIBRE_CLIENT_ID: '',
      MERCADOLIBRE_CLIENT_SECRET: '',
      MERCADOLIBRE_REDIRECT_URI: '',
      S3_ENDPOINT: '',
      S3_REGION: '',
      S3_BUCKET: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
    },
  },
});
