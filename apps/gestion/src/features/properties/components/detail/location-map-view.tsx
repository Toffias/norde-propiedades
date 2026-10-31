'use client';

import { Skeleton } from '@norde/ui/components/skeleton';
import { MapPinOffIcon } from 'lucide-react';
import dynamic from 'next/dynamic';

// Leaflet usa `window`: el mapa se carga solo en el navegador.
const LocationMapCanvas = dynamic(
  () => import('./location-map-canvas').then((module) => module.LocationMapCanvas),
  { ssr: false, loading: () => <Skeleton className="size-full min-h-[320px] rounded-none" /> },
);

/**
 * El mapa que llena una tarjeta de borde a borde (anula el padding del cuerpo), o un aviso si no hay
 * coordenadas. Lo usan las fichas de propiedad y de emprendimiento.
 */
export function LocationMapView({
  coordinates,
  emptyMessage,
}: {
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly emptyMessage: string;
}) {
  return (
    <div className="-m-5 flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-b-[13px]">
      {coordinates === undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-5 text-center text-sm text-muted-foreground">
          <MapPinOffIcon className="size-6" aria-hidden />
          {emptyMessage}
        </div>
      ) : (
        <LocationMapCanvas
          latitude={coordinates.latitude}
          longitude={coordinates.longitude}
          className="size-full min-h-[320px] flex-1"
        />
      )}
    </div>
  );
}
