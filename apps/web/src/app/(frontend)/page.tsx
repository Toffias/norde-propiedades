import type { Metadata } from 'next';

import { FeaturedListings } from '../../components/home/featured-listings';
import { HomeHero } from '../../components/home/home-hero';
import { NeighborhoodsRibbon } from '../../components/home/neighborhoods-ribbon';
import { LatestPostsSection } from '../../components/home/latest-posts-section';
import { OwnersCta } from '../../components/home/owners-cta';
import { ServicesSection } from '../../components/home/services-section';
import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { latestPosts } from '../../lib/blog/queries';
import { featuredListings, suggestLocations } from '../../lib/properties/queries';
import { buildMetadata } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';

// Se renderiza por request (el build corre sin base de datos); los datos salen del caché.
export const dynamic = 'force-dynamic';

const FEATURED_COUNT = 6;
/** Barrios de la cinta: los que más propiedades publicadas tienen. */
const RIBBON_LOCATIONS = 12;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: SITE_TITLE,
    description: BUSINESS.description,
    path: routes.home(),
  });
}

export default async function HomePage() {
  const [posts, featured, locations] = await Promise.all([
    latestPosts(3),
    featuredListings(FEATURED_COUNT),
    suggestLocations(''),
  ]);

  return (
    <div>
      <HomeHero />

      {/* "Cortina": el contenido sube como una hoja sobre el hero, que queda quieto detrás. */}
      {/* El header aparece cuando este bloque llega arriba (`HeaderShell`). */}
      <div
        data-header-reveal
        className="bg-background relative z-10 space-y-20 pt-20 pb-4 shadow-[0_-20px_40px_-20px_rgb(0_0_0/0.3)] sm:space-y-24 sm:pt-24"
      >
        <FeaturedListings listings={featured} />
        <NeighborhoodsRibbon locations={locations.slice(0, RIBBON_LOCATIONS)} />
        <ServicesSection />
        <LatestPostsSection posts={posts} />
        <OwnersCta />
      </div>
    </div>
  );
}
