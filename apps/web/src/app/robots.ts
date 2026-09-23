import type { MetadataRoute } from 'next';

import { buildRobots } from '../lib/seo/robots';
import { getSiteUrl } from '../lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteUrl());
}
