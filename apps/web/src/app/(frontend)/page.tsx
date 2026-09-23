import type { Metadata } from 'next';

import { HeroSearch } from '../../components/home/hero-search';
import { LatestPostsSection } from '../../components/home/latest-posts-section';
import { OwnersCta } from '../../components/home/owners-cta';
import { ServicesSection } from '../../components/home/services-section';
import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { latestPosts } from '../../lib/blog/queries';
import { buildMetadata } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';

// Se renderiza por request (el build corre sin base de datos); los datos salen del caché.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: SITE_TITLE,
    description: BUSINESS.description,
    path: routes.home(),
  });
}

export default async function HomePage() {
  const posts = await latestPosts(3);

  return (
    <div className="space-y-20 pb-4 sm:space-y-24">
      <section aria-labelledby="hero-title" className="bg-muted/40 border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl space-y-4">
            <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {BUSINESS.name}
            </p>
            <h1
              id="hero-title"
              className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl"
            >
              Encontrá la propiedad que estás buscando
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg">
              Casas, departamentos y locales en venta y alquiler, con asesoramiento profesional en
              cada paso.
            </p>
          </div>
          <div className="mt-10">
            <HeroSearch />
          </div>
        </div>
      </section>

      <ServicesSection />
      <LatestPostsSection posts={posts} />
      <OwnersCta />
    </div>
  );
}
