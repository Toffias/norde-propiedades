'use client';

import type { MapArea } from '@norde/core/properties/contracts';
import { Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { isExternal } from '../../lib/properties/images';
import { listingHref, type ListingFilters } from '../../lib/properties/listing-filters';
import type { MapPinView } from '../../lib/properties/view';

// Leaflet necesita `window`: se carga solo en el navegador, y su JS no entra en la carga inicial.
const Canvas = dynamic(() => import('./listing-map-canvas').then((m) => m.ListingMapCanvas), {
  ssr: false,
  loading: () => <div className="bg-muted h-full w-full animate-pulse" />,
});

interface ListingMapProps {
  readonly pins: readonly MapPinView[];
  readonly truncated: boolean;
  readonly filters: ListingFilters;
}

/**
 * Vista de mapa del listado: un pin con el precio por propiedad. Al tocar uno aparece su tarjeta;
 * al mover el mapa, "Buscar en esta zona" filtra por el área visible (y la grilla también).
 */
export function ListingMap({ pins, truncated, filters }: ListingMapProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [moved, setMoved] = useState<MapArea | undefined>();
  const selected = pins.find((pin) => pin.id === selectedId);

  return (
    // `isolate`: los z-index de Leaflet (400-1000) quedan dentro del mapa y no tapan el header sticky.
    <div className="bg-muted relative isolate h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden rounded-3xl border lg:h-[calc(100dvh-12rem)]">
      <Canvas
        pins={pins}
        area={filters.area}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={setMoved}
      />

      <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-14">
        {moved ? (
          <button
            type="button"
            onClick={() => {
              router.push(listingHref(filters, { area: moved }), { scroll: false });
              setMoved(undefined);
              setSelectedId(undefined);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 pointer-events-auto flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-lg transition-colors outline-none focus-visible:ring-[3px]"
          >
            <Search aria-hidden className="size-4" />
            Buscar en esta zona
          </button>
        ) : (
          truncated && (
            <p className="bg-card pointer-events-auto rounded-full border px-4 py-2 text-xs font-semibold shadow-md">
              Hay más propiedades: acercá el mapa o sumá filtros
            </p>
          )
        )}
      </div>

      {pins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center p-6">
          <p className="bg-card rounded-2xl border px-5 py-4 text-center text-sm font-semibold shadow-md">
            No hay propiedades con ubicación en el mapa para esta búsqueda.
          </p>
        </div>
      )}

      {selected && (
        <article className="bg-card text-card-foreground absolute inset-x-3 bottom-3 z-[500] flex overflow-hidden rounded-2xl border shadow-xl sm:inset-x-auto sm:left-3 sm:w-[24rem]">
          <Link href={selected.href} className="relative w-32 shrink-0 sm:w-36">
            {selected.cover ? (
              <Image
                src={selected.cover.src}
                alt={selected.cover.alt}
                fill
                sizes="144px"
                unoptimized={isExternal(selected.cover.src)}
                className="object-cover"
              />
            ) : (
              <span className="bg-muted block h-full w-full" />
            )}
          </Link>
          <div className="min-w-0 flex-1 p-3 pr-9">
            <p className="text-primary text-xs font-bold">{selected.operationLabel}</p>
            <p className="text-lg leading-tight font-extrabold">{selected.priceLabel}</p>
            <h2 className="mt-1 line-clamp-2 text-sm leading-snug font-semibold">
              <Link href={selected.href} className="hover:underline">
                {selected.title}
              </Link>
            </h2>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {[selected.location, selected.facts].filter((part) => part !== '').join(' · ')}
            </p>
            {!selected.exact && (
              <p className="text-muted-foreground mt-1 text-[11px]">Ubicación aproximada</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setSelectedId(undefined);
            }}
            className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-2 right-2 flex size-7 items-center justify-center rounded-full"
          >
            <X aria-hidden className="size-4" />
          </button>
        </article>
      )}
    </div>
  );
}
