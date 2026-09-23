import type { MetadataRoute } from 'next';

import { absoluteUrl } from './routes';

/** Crawlers de IA permitidos explícitamente (GEO: queremos que citen el contenido). */
export const AI_CRAWLERS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

/**
 * Rutas que no se indexan: el admin, la API y el preview. Con barra final, para no bloquear
 * por prefijo páginas públicas como `/administracion-de-alquileres`.
 */
export const DISALLOWED_PATHS: readonly string[] = ['/admin/', '/api/', '/next/'];

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
      { userAgent: [...AI_CRAWLERS], allow: '/', disallow: [...DISALLOWED_PATHS] },
    ],
    sitemap: absoluteUrl(siteUrl, '/sitemap.xml'),
  };
}
