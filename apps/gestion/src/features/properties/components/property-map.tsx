'use client';

import {
  MAX_MAP_PINS,
  PROPERTY_STATUS_VALUES,
  type PropertyMapPin,
  type PropertyMapResult,
} from '@norde/core/properties/contracts';
import { Skeleton } from '@norde/ui/components/skeleton';
import { StatusPill } from '@norde/ui/components/status-pill';
import { HomeIcon, XIcon } from 'lucide-react';
import type { Route } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatCount } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import type { MapArea, MapLayer, MapPin } from '../../shared/components/map-canvas';
import { loadMapPinsAction } from '../actions';
import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { attributesSummary, operationsSummary, placeSummary } from '../property-format';
import { activeFilters, type PropertyFilterValues } from './properties-toolbar';
import { PropertyPhoto } from './property-photo';

// Leaflet usa `window`: el mapa se carga solo en el navegador.
const MapCanvas = dynamic(
  () => import('../../shared/components/map-canvas').then((module) => module.MapCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

/** Una capa por estado, con los mismos tonos que la grilla. */
const LAYERS: readonly MapLayer[] = PROPERTY_STATUS_VALUES.map((status) => ({
  key: status,
  label: PROPERTY_STATUS_DISPLAY[status].label,
}));

function toMapPin(pin: PropertyMapPin): MapPin {
  return {
    id: pin.id,
    latitude: pin.latitude,
    longitude: pin.longitude,
    layer: pin.status,
    tone: PROPERTY_STATUS_DISPLAY[pin.status].tone,
    title: `${pin.code} · ${pin.portalTitle}`,
  };
}

/** Esperar a que el mapa quede quieto antes de pedir los pines del área. */
const AREA_DEBOUNCE_MS = 300;

/** La tarjeta del pin elegido, abajo del mapa, como en el sitio: toda lleva a la ficha. */
function PinCard({ pin, onClose }: { readonly pin: PropertyMapPin; readonly onClose: () => void }) {
  const status = PROPERTY_STATUS_DISPLAY[pin.status];
  const place = placeSummary(pin);
  const details = attributesSummary(pin.attributes);
  return (
    <article className="group absolute inset-x-3 bottom-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-primary-300 sm:inset-x-auto sm:left-3 sm:w-[26rem] dark:hover:border-primary-700">
      <div className="relative w-32 shrink-0 bg-muted sm:w-40">
        <PropertyPhoto
          propertyId={pin.id}
          cover={pin.cover}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <HomeIcon className="h-7 w-7" aria-hidden />
              <span className="sr-only">Sin fotos</span>
            </div>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 pr-10">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {pin.code} · {PROPERTY_TYPE_LABELS[pin.propertyType]}
        </span>
        <h2 className="line-clamp-2 text-sm leading-snug font-semibold" title={pin.portalTitle}>
          {/* El link se estira sobre la tarjeta (`after:`): toda lleva a la ficha. */}
          <Link
            href={`/propiedades/${pin.id}` as Route}
            className="outline-none after:absolute after:inset-0 group-hover:underline"
          >
            {pin.portalTitle}
          </Link>
        </h2>
        {place !== '' && <p className="truncate text-xs text-muted-foreground">{place}</p>}
        <p className="text-sm font-semibold tabular-nums">{operationsSummary(pin.operations)}</p>
        {details !== '' && <p className="truncate text-xs text-muted-foreground">{details}</p>}
        <StatusPill tone={status.tone} className="mt-1 self-start">
          {status.label}
        </StatusPill>
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </article>
  );
}

/**
 * Vista de mapa del buscador: los pines del área visible con los mismos filtros. Al tocar uno
 * aparece su tarjeta, que lleva a la ficha. Las propiedades sin coordenadas no aparecen.
 */
export function PropertyMap({
  filters,
  toolbar,
}: {
  readonly filters: PropertyFilterValues;
  readonly toolbar: ReactNode;
}) {
  const [result, setResult] = useState<PropertyMapResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [area, setArea] = useState<MapArea | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const request = useRef(0);
  const pins = useMemo(() => (result?.pins ?? []).map(toMapPin), [result]);
  // Si el pin elegido sale del área (o de los filtros), su tarjeta se cierra sola.
  const selected = result?.pins.find((pin) => pin.id === selectedId);

  const onAreaChange = useCallback((next: MapArea) => {
    setArea(next);
  }, []);

  useEffect(() => {
    if (area === undefined) return;
    const current = ++request.current;
    const timer = setTimeout(() => {
      loadMapPinsAction({ ...activeFilters(filters), ...area }).then(
        (response) => {
          // Una respuesta vieja (de un área ya reemplazada) no pisa la actual.
          if (current !== request.current) return;
          if (response.ok) {
            setResult(response.value);
            setError(undefined);
          } else {
            setError(response.message);
          }
        },
        () => {
          if (current === request.current) setError(UNEXPECTED_ERROR_MESSAGE);
        },
      );
    }, AREA_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [area, filters]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {toolbar}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-muted-foreground">
        <span role="status">
          {result === undefined
            ? 'Buscando propiedades en el área…'
            : formatCount(result.total, 'propiedad en el área', 'propiedades en el área')}
        </span>
        {result?.truncated === true && (
          <span>
            Se muestran las {MAX_MAP_PINS} actualizadas más recientemente: acercá el mapa para ver
            el resto.
          </span>
        )}
      </div>
      {error !== undefined && (
        <div className="px-4 pb-2">
          <FormAlert message={error} />
        </div>
      )}
      {/* `isolate`: los z-index de Leaflet (400-1000) quedan dentro del mapa. */}
      <div className="relative isolate h-[60vh] min-h-[360px] w-full">
        <MapCanvas
          pins={pins}
          layers={LAYERS}
          label="Mapa de propiedades"
          onAreaChange={onAreaChange}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
        {selected !== undefined && (
          <PinCard
            pin={selected}
            onClose={() => {
              setSelectedId(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}
