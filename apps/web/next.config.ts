import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

import { DEVICE_SIZES, IMAGE_SIZES } from './src/lib/images/sizes';

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
    localPatterns: [
      // Imágenes del contenido editorial, servidas por Payload.
      { pathname: '/api/media/file/**' },
      // Fotos de las propiedades (ADR 0023).
      { pathname: '/fotos/**' },
    ],
    // Solo WebP: AVIF pesa ~40 % menos, pero tarda 2 a 3 veces más en convertirse y la primera
    // visita a cada foto lo paga (medido en UAT: 1-2,5 s contra 0,6-0,9 s).
    formats: ['image/webp'],
    deviceSizes: DEVICE_SIZES,
    imageSizes: IMAGE_SIZES,
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
