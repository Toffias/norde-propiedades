'use client';

import dynamic from 'next/dynamic';

import type { PropertyMapProps } from './property-map-canvas';

// Leaflet necesita `window`: se carga solo en el navegador, y su JS no entra en la carga inicial.
const Canvas = dynamic(() => import('./property-map-canvas').then((m) => m.PropertyMapCanvas), {
  ssr: false,
  loading: () => <div className="bg-muted h-full w-full animate-pulse" />,
});

/** `className` reemplaza el alto y el radio de la ficha (`h-80 rounded-3xl`). */
export function PropertyMap({
  className = 'h-80 rounded-3xl',
  ...props
}: PropertyMapProps & { readonly className?: string }) {
  return (
    <div className={`overflow-hidden border ${className}`}>
      <Canvas {...props} />
    </div>
  );
}
