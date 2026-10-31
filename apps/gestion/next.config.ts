import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: ['@norde/core', '@norde/infra', '@norde/ui'],
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  redirects() {
    // El alta de tasaciones pasó al panel lateral del listado: los enlaces viejos llegan ahí.
    return Promise.resolve([
      { source: '/tasaciones/nueva', destination: '/tasaciones?panel=new', permanent: false },
    ]);
  },
  experimental: {
    // Subida de archivos al gestor de Mi empresa (hasta 25 MB, más el resto del formulario).
    serverActions: { bodySizeLimit: '26mb' },
    proxyClientMaxBodySize: '26mb',
  },
};

// Errores a Sentry (ADR 0049). Con `SENTRY_AUTH_TOKEN` en el build, sube los source maps para leer
// los stack traces; sin él, el build sigue igual.
export default withSentryConfig(config, {
  org: 'apz-software',
  project: 'norde-propiedades',
  silent: true,
  telemetry: false,
  widenClientFileUpload: true,
});
