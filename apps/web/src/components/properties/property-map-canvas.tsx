'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

export interface PropertyMapProps {
  readonly latitude: number;
  readonly longitude: number;
  /** `false`: coordenadas aproximadas. Se marca una zona, nunca la puerta. */
  readonly exact: boolean;
  readonly label: string;
}

/** Radio de la zona cuando la ubicación es aproximada: unas cuadras alrededor. */
const APPROXIMATE_RADIUS_M = 250;

/** Mapa de la ficha con OpenStreetMap (ADR 0019): pin si es exacta, círculo si es aproximada. */
export function PropertyMapCanvas({ latitude, longitude, exact, label }: PropertyMapProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const center: L.LatLngTuple = [latitude, longitude];
    const map = L.map(element, { scrollWheelZoom: false }).setView(center, exact ? 16 : 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(map);
    const brand = getComputedStyle(element).getPropertyValue('--primary').trim() || '#c9302b';
    if (exact) {
      L.marker(center, {
        title: label,
        icon: L.divIcon({
          className: '',
          html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:${brand};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);
    } else {
      L.circle(center, {
        radius: APPROXIMATE_RADIUS_M,
        color: brand,
        fillColor: brand,
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(map);
    }
    return () => {
      map.remove();
    };
  }, [latitude, longitude, exact, label]);

  return <div ref={container} className="isolate h-full w-full" role="region" aria-label={label} />;
}
