'use client';

import dynamic from 'next/dynamic';

import type { PropertyMapProps } from './property-map-canvas';

// Leaflet necesita `window`: se carga solo en el navegador, y su JS no entra en la carga inicial.
const Canvas = dynamic(() => import('./property-map-canvas').then((m) => m.PropertyMapCanvas), {
  ssr: false,
  loading: () => <div className="bg-muted h-full w-full animate-pulse" />,
});

export function PropertyMap(props: PropertyMapProps) {
  return (
    <div className="h-80 overflow-hidden rounded-3xl border">
      <Canvas {...props} />
    </div>
  );
}
