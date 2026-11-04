import Link from 'next/link';

import { listingHref } from '../../lib/properties/listing-filters';
import type { LocationOption } from '../../lib/properties/view';

/** Con menos, una vuelta de la cinta no llena la pantalla y se ve el corte: se repiten. */
const MIN_ITEMS = 8;

/**
 * Cinta de barrios de la home: los barrios y localidades con más propiedades publicadas desfilan
 * lento, y cada uno lleva al listado filtrado. La lista va dos veces para que la vuelta no se note;
 * la copia queda fuera del lector de pantalla y del Tab. No reacciona al mouse; solo se frena si
 * algo adentro toma el foco con el teclado y, con "reducir movimiento", queda quieta y se recorre con scroll horizontal.
 */
export function NeighborhoodsRibbon({
  locations,
}: {
  readonly locations: readonly LocationOption[];
}) {
  if (locations.length === 0) return null;

  const repeats = Math.ceil(MIN_ITEMS / locations.length);
  const items = Array.from({ length: repeats }, (_, round) =>
    locations.map((location) => ({ location, key: `${String(round)}-${location.id}` })),
  ).flat();

  const list = (copy: boolean) => (
    <ul
      aria-hidden={copy || undefined}
      className="neighborhoods-ribbon-list flex shrink-0 items-center"
    >
      {items.map(({ location, key }) => (
        <li key={key} className="flex items-center">
          <Link
            href={listingHref({ locationIds: [location.id], sort: 'featured', page: 1 })}
            tabIndex={copy ? -1 : undefined}
            className="font-display text-foreground/80 px-5 text-2xl whitespace-nowrap sm:px-6 sm:text-3xl"
          >
            {location.name}
          </Link>
          <span aria-hidden className="text-primary text-xl">
            ·
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="neighborhoods-title" className="border-y py-6 sm:py-7">
      <h2 id="neighborhoods-title" className="sr-only">
        Barrios con propiedades
      </h2>
      <div className="neighborhoods-ribbon overflow-hidden">
        <div className="neighborhoods-ribbon-track flex w-max">
          {list(false)}
          {list(true)}
        </div>
      </div>
    </section>
  );
}
