import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

/** Cabeceras de seguridad sitewide (también son señal de confianza para buscadores). */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: ['@norde/core', '@norde/infra', '@norde/ui'],
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Imágenes del contenido editorial, servidas por Payload.
    localPatterns: [{ pathname: '/api/media/file/**' }],
    formats: ['image/avif', 'image/webp'],
  },
  // Sin CSP por ahora: exige nonces para los scripts inline (JSON-LD, Next.js); va aparte.
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: SECURITY_HEADERS },
      // El admin nunca se indexa (robots.txt no alcanza si alguien lo enlaza).
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ]);
  },
};

export default withPayload(config);
