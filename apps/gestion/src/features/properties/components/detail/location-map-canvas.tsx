'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { cn } from '@norde/ui/lib/utils';
import { useEffect, useRef } from 'react';

/** Mapa de OpenStreetMap con un solo pin: la ubicación de la propiedad (ADR 0019). */
export function LocationMapCanvas({
  latitude,
  longitude,
  className = 'h-[50vh] min-h-[300px] w-full rounded-lg',
}: {
  readonly latitude: number;
  readonly longitude: number;
  /** Tamaño y bordes del mapa; por ejemplo, para que llene el alto de una tarjeta. */
  readonly className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const map = L.map(element, { scrollWheelZoom: false }).setView([latitude, longitude], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    L.marker([latitude, longitude], {
      icon: L.divIcon({
        className: '',
        html: '<span class="block h-[20px] w-[20px] rounded-full border-2 border-white bg-primary-600 shadow-md ring-1 ring-black/40"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map);
    // Si el contenedor cambia de alto (una tarjeta que se estira), Leaflet recalcula las teselas.
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [latitude, longitude]);

  // `relative z-0` encierra los z-index de Leaflet (los controles usan 1000): sin eso, el zoom
  // queda encima de los diálogos que se abren sobre la ficha y les tapa los botones.
  return <div ref={container} className={cn('relative z-0', className)} />;
}
