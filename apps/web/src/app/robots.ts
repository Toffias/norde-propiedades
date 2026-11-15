import type { MetadataRoute } from 'next';

import { getEnv } from '../config/env';
import { buildRobots } from '../lib/seo/robots';
import { getSiteUrl } from '../lib/site-url';

// Se arma en cada pedido con el `.env` del servidor: el build corre en CI, sin `ALLOW_INDEXING`.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteUrl(), getEnv().ALLOW_INDEXING);
}
