import type { Metadata } from 'next';

import { FeaturedListings } from '../../components/home/featured-listings';
import { HomeHero } from '../../components/home/home-hero';
import { LatestPostsSection } from '../../components/home/latest-posts-section';
import { OwnersCta } from '../../components/home/owners-cta';
import { ServicesSection } from '../../components/home/services-section';
import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { latestPosts } from '../../lib/blog/queries';
import { featuredListings } from '../../lib/properties/queries';
import { buildMetadata } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';

// Se renderiza por request (el build corre sin base de datos); los datos salen del caché.
export const dynamic = 'force-dynamic';

const FEATURED_COUNT = 6;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: SITE_TITLE,
    description: BUSINESS.description,
    path: routes.home(),
  });
}

export default async function HomePage() {
  const [posts, featured] = await Promise.all([latestPosts(3), featuredListings(FEATURED_COUNT)]);

  return (
    <div className="space-y-20 pb-4 sm:space-y-24">
      <HomeHero />

      <FeaturedListings listings={featured} />
      <ServicesSection />
      <LatestPostsSection posts={posts} />
      <OwnersCta />
    </div>
  );
}
