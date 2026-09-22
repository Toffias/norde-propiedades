import type { NextConfig } from 'next';

const config: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: ['@norde/core', '@norde/infra', '@norde/ui'],
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
};

export default config;
