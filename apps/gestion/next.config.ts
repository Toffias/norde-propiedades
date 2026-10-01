import type { NextConfig } from 'next';

const config: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: ['@norde/core', '@norde/infra', '@norde/ui'],
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // Subida de archivos al gestor de Mi empresa (hasta 25 MB, más el resto del formulario).
    serverActions: { bodySizeLimit: '26mb' },
    proxyClientMaxBodySize: '26mb',
  },
};

export default config;
