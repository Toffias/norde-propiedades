import { getEnv } from '../config/env';

/** URL pública del sitio (canonical, JSON-LD, sitemap). */
export function getSiteUrl(): string {
  return getEnv().NEXT_PUBLIC_SERVER_URL;
}
