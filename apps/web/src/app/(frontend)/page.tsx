import type { Metadata } from 'next';
import Image from 'next/image';

import { FeaturedListings } from '../../components/home/featured-listings';
import { HeroSearch } from '../../components/home/hero-search';
import { LatestPostsSection } from '../../components/home/latest-posts-section';
import { OwnersCta } from '../../components/home/owners-cta';
import { ServicesSection } from '../../components/home/services-section';
import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { latestPosts } from '../../lib/blog/queries';
import { isExternal } from '../../lib/properties/images';
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
  // La foto del hero es la portada de la primera destacada: siempre una propiedad real.
  const heroImage = featured.find((listing) => listing.cover)?.cover ?? null;

  return (
    <div className="space-y-20 pb-4 sm:space-y-24">
      <section aria-labelledby="hero-title" className="px-2 pt-2 sm:px-4 sm:pt-4">
        <div className="bg-ink relative isolate mx-auto max-w-[96rem] overflow-hidden rounded-[28px]">
          {heroImage && (
            <>
              <Image
                src={heroImage.src}
                alt=""
                fill
                priority
                sizes="100vw"
                unoptimized={isExternal(heroImage.src)}
                className="-z-10 object-cover"
              />
              <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
            </>
          )}
          <div className="mx-auto flex min-h-[30rem] max-w-7xl flex-col justify-end px-5 pt-24 pb-8 sm:min-h-[34rem] sm:px-10 sm:pb-12">
            <h1
              id="hero-title"
              className="max-w-3xl text-4xl leading-[1.05] font-extrabold text-white sm:text-6xl"
            >
              Te ayudamos a encontrar tu lugar en el barrio
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-white/85">
              Casas, departamentos y PH en venta y alquiler, con asesoramiento en cada paso.
            </p>
            <div className="mt-8 max-w-4xl">
              <HeroSearch />
            </div>
          </div>
        </div>
      </section>

      <FeaturedListings listings={featured} />
      <ServicesSection />
      <LatestPostsSection posts={posts} />
      <OwnersCta />
    </div>
  );
}
