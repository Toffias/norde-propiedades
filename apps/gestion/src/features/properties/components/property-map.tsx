'use client';

import {
  MAX_MAP_PINS,
  PROPERTY_STATUS_VALUES,
  type PropertyMapPin,
  type PropertyMapResult,
} from '@norde/core/properties/contracts';
import { Skeleton } from '@norde/ui/components/skeleton';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatCount } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import type { MapArea, MapLayer, MapPin } from '../../shared/components/map-canvas';
import { loadMapPinsAction } from '../actions';
import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { operationsSummary } from '../property-format';
import type { PropertyFilterValues } from './properties-toolbar';

// Leaflet usa `window`: el mapa se carga solo en el navegador.
const MapCanvas = dynamic(
  () => import('../../shared/components/map-canvas').then((module) => module.MapCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[60vh] min-h-[360px] w-full rounded-none" />,
  },
);

/** Una capa por estado, con los mismos tonos que la grilla. */
const LAYERS: readonly MapLayer[] = PROPERTY_STATUS_VALUES.map((status) => ({
  key: status,
  label: PROPERTY_STATUS_DISPLAY[status].label,
}));

function toMapPin(pin: PropertyMapPin): MapPin {
  const status = PROPERTY_STATUS_DISPLAY[pin.status];
  return {
    id: pin.id,
    latitude: pin.latitude,
    longitude: pin.longitude,
    layer: pin.status,
    tone: status.tone,
    title: `${pin.code} · ${pin.portalTitle}`,
    popup: [
      { text: `${pin.code} · ${PROPERTY_TYPE_LABELS[pin.propertyType]}`, strong: true },
      { text: pin.portalTitle },
      { text: operationsSummary(pin.operations) },
      { text: status.label, muted: true },
    ],
  };
}

/** Esperar a que el mapa quede quieto antes de pedir los pines del área. */
const AREA_DEBOUNCE_MS = 300;

/**
 * Vista de mapa del buscador: los pines del área visible con los mismos filtros. Las propiedades
 * sin coordenadas no aparecen.
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
  const request = useRef(0);
  const pins = useMemo(() => (result?.pins ?? []).map(toMapPin), [result]);

  const onAreaChange = useCallback((next: MapArea) => {
    setArea(next);
  }, []);

  useEffect(() => {
    if (area === undefined) return;
    const current = ++request.current;
    const timer = setTimeout(() => {
      const filter = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== ''),
      );
      loadMapPinsAction({ ...filter, ...area }).then(
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
      <MapCanvas
        pins={pins}
        layers={LAYERS}
        label="Mapa de propiedades"
        onAreaChange={onAreaChange}
      />
    </div>
  );
}
