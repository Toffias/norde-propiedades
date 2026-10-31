'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import type { StatusTone } from '@norde/ui/components/status-pill';
import L from 'leaflet';
// Después de leaflet: el plugin se registra sobre el `L` global que deja leaflet.
import 'leaflet.markercluster';
import { useEffect, useRef } from 'react';

export interface MapArea {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Una capa del mapa, que se prende y se apaga (un estado, por ejemplo). */
export interface MapLayer {
  readonly key: string;
  readonly label: string;
}

export interface MapPin {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** La `key` de su capa. */
  readonly layer: string;
  /** Color del pin, con los mismos tonos que la grilla. */
  readonly tone: StatusTone;
  /** Lo que se lee al pasar el mouse. */
  readonly title: string;
  /** Las líneas del globo, como texto: se escapan al armarlo. Sin globo con `onSelect`. */
  readonly popup?: readonly {
    readonly text: string;
    readonly strong?: boolean;
    readonly muted?: boolean;
  }[];
  /** Link del globo (la ficha). */
  readonly href?: string;
}

/** Centro de partida: la Ciudad de Buenos Aires. */
const START = { center: [-34.6, -58.44] as L.LatLngTuple, zoom: 12 };

const PIN_CLASS: Readonly<Record<string, string>> = {
  green: 'bg-success-600',
  amber: 'bg-warning-600',
  red: 'bg-danger-600',
  gray: 'bg-gray-600',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** El pin elegido, más grande y con el anillo de la marca. */
function pinIcon(tone: StatusTone, selected = false): L.DivIcon {
  const size = selected ? 26 : 18;
  const ring = selected ? 'ring-4 ring-primary-500/60' : 'ring-1 ring-black/40';
  return L.divIcon({
    className: '',
    html: `<span class="block rounded-full border-2 border-white shadow-md ${ring} ${PIN_CLASS[tone] ?? ''}" style="width:${size}px;height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -10],
  });
}

function popupHtml(pin: MapPin): string {
  const lines = (pin.popup ?? []).map((line) => {
    const text = escapeHtml(line.text);
    if (line.strong === true) return `<strong>${text}</strong>`;
    if (line.muted === true) return `<div style="opacity:.7">${text}</div>`;
    return `<div>${text}</div>`;
  });
  if (pin.href !== undefined) {
    lines.push(`<div><a href="${escapeHtml(pin.href)}">Abrir la ficha</a></div>`);
  }
  return lines.join('');
}

/**
 * Mapa de Leaflet con OpenStreetMap (ADR 0019): una capa por grupo, que se prende y se apaga, con
 * los pines agrupados cuando están cerca. Avisa el área visible cada vez que se mueve.
 *
 * Con `onSelect`, tocar un pin lo elige (y tocar el mapa lo suelta) en vez de abrir su globo: la
 * pantalla muestra su propia tarjeta.
 */
export function MapCanvas({
  pins,
  layers,
  label,
  onAreaChange,
  selectedId,
  onSelect,
}: {
  readonly pins: readonly MapPin[];
  readonly layers: readonly MapLayer[];
  readonly label: string;
  readonly onAreaChange: (area: MapArea) => void;
  readonly selectedId?: string | undefined;
  readonly onSelect?: (id: string | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const groups = useRef(new Map<string, L.MarkerClusterGroup>());
  const markers = useRef(new Map<string, L.Marker>());
  const onArea = useRef(onAreaChange);
  const select = useRef(onSelect);
  const initialLayers = useRef(layers);

  useEffect(() => {
    onArea.current = onAreaChange;
    select.current = onSelect;
  }, [onAreaChange, onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { center: START.center, zoom: START.zoom });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);

    const overlays: Record<string, L.Layer> = {};
    const byKey = groups.current;
    for (const layer of initialLayers.current) {
      const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
      group.addTo(instance);
      byKey.set(layer.key, group);
      overlays[layer.label] = group;
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
    // El click de un pin no llega al mapa: este es el de tocar afuera.
    instance.on('click', () => {
      select.current?.(undefined);
    });
    map.current = instance;
    report();
    // Leaflet mide el contenedor al crearse; si el layout cambia (menú contraído), se recalcula.
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
    });
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      byKey.clear();
    };
  }, []);

  useEffect(() => {
    for (const group of groups.current.values()) group.clearLayers();
    markers.current.clear();
    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: pinIcon(pin.tone),
        title: pin.title,
        keyboard: true,
      });
      if (select.current === undefined) {
        marker.bindPopup(popupHtml(pin));
      } else {
        marker.on('click', () => {
          select.current?.(pin.id);
        });
      }
      markers.current.set(pin.id, marker);
      groups.current.get(pin.layer)?.addLayer(marker);
    }
  }, [pins]);

  // Resalta el pin elegido.
  useEffect(() => {
    for (const pin of pins) {
      const marker = markers.current.get(pin.id);
      marker?.setIcon(pinIcon(pin.tone, pin.id === selectedId));
      marker?.setZIndexOffset(pin.id === selectedId ? 1000 : 0);
    }
  }, [pins, selectedId]);

  return <div ref={container} role="region" aria-label={label} className="h-full w-full" />;
}
