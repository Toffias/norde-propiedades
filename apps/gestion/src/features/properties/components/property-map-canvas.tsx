'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import {
  PROPERTY_STATUS_VALUES,
  type PropertyMapPin,
  type PropertyStatusValue,
} from '@norde/core/properties/contracts';
import L from 'leaflet';
// Después de leaflet: el plugin se registra sobre el `L` global que deja leaflet.
import 'leaflet.markercluster';
import { useEffect, useRef } from 'react';

import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { operationsSummary } from '../property-format';

export interface MapArea {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Centro de partida: la Ciudad de Buenos Aires. */
const START = { center: [-34.6, -58.44] as L.LatLngTuple, zoom: 12 };

/** Color del pin según el estado, con los mismos tonos que la grilla. */
const PIN_CLASS: Readonly<Record<string, string>> = {
  green: 'bg-success-600',
  amber: 'bg-warning-600',
  red: 'bg-danger-600',
  gray: 'bg-gray-600',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function pinIcon(status: PropertyStatusValue): L.DivIcon {
  const tone = PROPERTY_STATUS_DISPLAY[status].tone;
  return L.divIcon({
    className: '',
    html: `<span class="block h-[18px] w-[18px] rounded-full border-2 border-white shadow-md ring-1 ring-black/40 ${PIN_CLASS[tone] ?? ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function popupHtml(pin: PropertyMapPin): string {
  const status = PROPERTY_STATUS_DISPLAY[pin.status].label;
  return [
    `<strong>${escapeHtml(pin.code)}</strong> · ${escapeHtml(PROPERTY_TYPE_LABELS[pin.propertyType])}`,
    `<div>${escapeHtml(pin.portalTitle)}</div>`,
    `<div>${escapeHtml(operationsSummary(pin.operations))}</div>`,
    `<div style="opacity:.7">${escapeHtml(status)}</div>`,
  ].join('');
}

/**
 * Mapa de Leaflet con OpenStreetMap (ADR 0019): una capa por estado, que se prende y se apaga, con
 * los pines agrupados cuando están cerca. Avisa el área visible cada vez que se mueve.
 */
export function PropertyMapCanvas({
  pins,
  onAreaChange,
}: {
  readonly pins: readonly PropertyMapPin[];
  readonly onAreaChange: (area: MapArea) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<PropertyStatusValue, L.MarkerClusterGroup>());
  const onArea = useRef(onAreaChange);

  useEffect(() => {
    onArea.current = onAreaChange;
  }, [onAreaChange]);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { center: START.center, zoom: START.zoom });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);

    const overlays: Record<string, L.Layer> = {};
    const groups = layers.current;
    for (const status of PROPERTY_STATUS_VALUES) {
      const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
      group.addTo(instance);
      groups.set(status, group);
      overlays[PROPERTY_STATUS_DISPLAY[status].label] = group;
    }
    L.control.layers(undefined, overlays, { collapsed: true }).addTo(instance);

    const report = () => {
      const bounds = instance.getBounds();
      onArea.current({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    };
    instance.on('moveend', report);
    map.current = instance;
    report();

    return () => {
      instance.remove();
      map.current = null;
      groups.clear();
    };
  }, []);

  useEffect(() => {
    for (const group of layers.current.values()) group.clearLayers();
    for (const pin of pins) {
      layers.current.get(pin.status)?.addLayer(
        L.marker([pin.latitude, pin.longitude], {
          icon: pinIcon(pin.status),
          title: `${pin.code} · ${pin.portalTitle}`,
        }).bindPopup(popupHtml(pin)),
      );
    }
  }, [pins]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Mapa de propiedades"
      className="relative z-0 h-[60vh] min-h-[360px] w-full"
    />
  );
}
