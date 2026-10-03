'use client';

import {
  DEVELOPMENT_STATUS_VALUES,
  MAX_DEVELOPMENT_MAP_PINS,
  type DevelopmentMapPin,
  type DevelopmentMapResult,
} from '@norde/core/properties/contracts';
import { Skeleton } from '@norde/ui/components/skeleton';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatCount } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import type { MapArea, MapLayer, MapPin } from '../../shared/components/map-canvas';
import { loadDevelopmentMapPinsAction } from '../actions';
import { DEVELOPMENT_STATUS_DISPLAY } from '../labels';
import type { DevelopmentFilterValues } from './developments-view';

// Leaflet usa `window`: el mapa se carga solo en el navegador.
const MapCanvas = dynamic(
  () => import('../../shared/components/map-canvas').then((module) => module.MapCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[60vh] min-h-[360px] w-full rounded-none" />,
  },
);

/** Esperar a que el mapa quede quieto antes de pedir los pines del área. */
const AREA_DEBOUNCE_MS = 300;

/** Una capa por estado, con los mismos tonos que la grilla. */
const LAYERS: readonly MapLayer[] = DEVELOPMENT_STATUS_VALUES.map((status) => ({
  key: status,
  label: DEVELOPMENT_STATUS_DISPLAY[status].label,
}));

function toMapPin(pin: DevelopmentMapPin): MapPin {
  const status = DEVELOPMENT_STATUS_DISPLAY[pin.status];
  return {
    id: pin.id,
    latitude: pin.latitude,
    longitude: pin.longitude,
    layer: pin.status,
    tone: status.tone,
    title: `${pin.code} · ${pin.name}`,
    popup: [
      { text: `${pin.code} · ${pin.name}`, strong: true },
      ...(pin.publishAddress === undefined ? [] : [{ text: pin.publishAddress }]),
      { text: formatCount(pin.unitCount, 'unidad', 'unidades') },
      { text: status.label, muted: true },
    ],
    href: `/emprendimientos/${pin.id}`,
  };
}

/**
 * Vista de mapa del listado: los emprendimientos activos del área visible, con los mismos filtros.
 * Los que no tienen coordenadas no aparecen.
 */
export function DevelopmentMap({
  filters,
  toolbar,
}: {
  readonly filters: DevelopmentFilterValues;
  readonly toolbar: ReactNode;
}) {
  const [result, setResult] = useState<DevelopmentMapResult | undefined>();
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
    const { q, status, developmentType, constructionStatus } = filters;
    const filter = Object.fromEntries(
      Object.entries({ q, status, developmentType, constructionStatus }).filter(
        ([, value]) => value !== '',
      ),
    );
    const timer = setTimeout(() => {
      loadDevelopmentMapPinsAction({ ...filter, ...area }).then(
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
            ? 'Buscando emprendimientos en el área…'
            : formatCount(result.total, 'emprendimiento en el área', 'emprendimientos en el área')}
        </span>
        {result?.truncated === true && (
          <span>
            Se muestran los {MAX_DEVELOPMENT_MAP_PINS} actualizados más recientemente: acercá el
            mapa para ver el resto.
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
        label="Mapa de emprendimientos"
        onAreaChange={onAreaChange}
      />
    </div>
  );
}
