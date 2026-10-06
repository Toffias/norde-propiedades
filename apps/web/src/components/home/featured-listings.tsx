import type { ListingCard } from '../../lib/properties/view';
import { routes } from '../../lib/seo/routes';
import { SectionHeading } from '../layout/section-heading';
import { ListingGrid } from '../properties/listing-card';

/** Destacadas de la home. Sin propiedades publicadas no se muestra. */
export function FeaturedListings({ listings }: { readonly listings: readonly ListingCard[] }) {
  if (listings.length === 0) return null;

  return (
    <section aria-labelledby="featured-title" className="mx-auto max-w-7xl px-4 sm:px-6">
      <SectionHeading
        id="featured-title"
        title="Propiedades destacadas"
        description="Una selección de lo que tenemos hoy en venta y alquiler."
        link={{ href: routes.properties(), label: 'Ver todas las propiedades' }}
      />
      <div className="mt-8">
        <ListingGrid listings={listings} />
      </div>
    </section>
  );
}
