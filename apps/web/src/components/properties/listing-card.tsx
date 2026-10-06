import { cn } from '@norde/ui/lib/utils';
import {
  Bath,
  BedDouble,
  Camera,
  Car,
  DoorOpen,
  House,
  Ruler,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { isExternal } from '../../lib/properties/images';
import type { ListingCard as ListingCardData, ListingFactKind } from '../../lib/properties/view';

const FACT_ICONS: Readonly<Record<ListingFactKind, LucideIcon>> = {
  surface: Ruler,
  rooms: DoorOpen,
  bedrooms: BedDouble,
  bathrooms: Bath,
  parking: Car,
};

interface ListingCardProps {
  readonly listing: ListingCardData;
  /** Las primeras tarjetas de la página cargan su foto con prioridad (LCP). */
  readonly priority?: boolean;
  /** `h2` en el listado, `h3` dentro de una sección con su propio título. */
  readonly headingLevel?: 'h2' | 'h3';
}

/** Tarjeta de una propiedad: foto, operación, precio, ubicación y datos principales. */
export function ListingCard({ listing, priority = false, headingLevel = 'h3' }: ListingCardProps) {
  const Heading = headingLevel;

  return (
    <article className="group bg-card w-full hover:border-brand-200 dark:hover:border-brand-800 relative flex flex-col overflow-hidden rounded-3xl border transition-colors">
      <div className="bg-muted relative m-2 aspect-[4/3] overflow-hidden rounded-2xl">
        {listing.cover ? (
          <Image
            src={listing.cover.src}
            alt={listing.cover.alt}
            fill
            sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
            priority={priority}
            unoptimized={isExternal(listing.cover.src)}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <House aria-hidden className="size-10" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="bg-brand-600 rounded-lg px-2.5 py-1 text-xs font-bold text-white">
            {listing.operationLabel}
          </span>
          {listing.featured && (
            <span className="bg-card/90 text-foreground rounded-lg px-2.5 py-1 text-xs font-bold">
              Destacada
            </span>
          )}
        </div>
        {listing.photoCount > 1 && (
          <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white">
            <Camera aria-hidden className="size-3.5" />
            {listing.photoCount}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pt-2 pb-5">
        <p
          className={cn(
            'text-xl font-extrabold tracking-tight',
            !listing.hasPrice && 'text-muted-foreground text-lg font-bold',
          )}
        >
          {listing.priceLabel}
        </p>
        {listing.expensesLabel && (
          <p className="text-muted-foreground text-xs">{listing.expensesLabel}</p>
        )}
        <Heading className="mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          {/* El link cubre toda la tarjeta: un solo destino, accesible por el título. */}
          <Link href={listing.href} className="after:absolute after:inset-0">
            {listing.title}
          </Link>
        </Heading>
        <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
          {listing.address ? `${listing.address} · ${listing.location}` : listing.location}
        </p>
        {listing.facts.length > 0 && (
          <ul className="text-muted-foreground mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed pt-3 text-[13px]">
            {listing.facts.map((fact) => {
              const Icon = FACT_ICONS[fact.kind];
              return (
                <li key={fact.kind} className="flex items-center gap-1.5">
                  <Icon aria-hidden className="size-3.5" />
                  {fact.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Grilla responsive de tarjetas. */
export function ListingGrid({
  listings,
  headingLevel,
  priorityCount = 0,
}: {
  readonly listings: readonly ListingCardData[];
  readonly headingLevel?: 'h2' | 'h3';
  readonly priorityCount?: number;
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing, index) => (
        <li key={listing.id} className="flex">
          <ListingCard
            listing={listing}
            priority={index < priorityCount}
            {...(headingLevel && { headingLevel })}
          />
        </li>
      ))}
    </ul>
  );
}
