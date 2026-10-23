'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import type { MapArea } from '@norde/core/properties/contracts';
import L from 'leaflet';
// Después de leaflet: el plugin se registra sobre el `L` global que deja leaflet.
import 'leaflet.markercluster';
import { useEffect, useRef } from 'react';

import type { MapPinView } from '../../lib/properties/view';

/** Sin pines ni área: el oeste de la Ciudad y el primer cordón, donde trabaja Norde. */
const START = { center: [-34.63, -58.5] as L.LatLngTuple, zoom: 12 };

/** Lo que tarda el encuadre automático (con animación) en asentarse. */
const FIT_SETTLE_MS = 800;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** El pin es la etiqueta del precio, como en los portales. El elegido, en el color de la marca. */
function priceIcon(pin: MapPinView, selected: boolean): L.DivIcon {
  const tone = selected
    ? 'bg-primary text-primary-foreground border-primary scale-110'
    : 'bg-card text-card-foreground border-border hover:border-primary';
  return L.divIcon({
    className: '',
    html: `<span class="map-price-pin ${tone}">${escapeHtml(pin.shortPrice)}</span>`,
    // Sin tamaño fijo: el ancho depende del precio. `.map-price-pin` se centra sobre el punto.
    iconSize: undefined,
  });
}

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 40 : count < 50 ? 46 : 54;
  return L.divIcon({
    className: '',
    html: `<span class="map-cluster-pin" style="width:${size}px;height:${size}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export interface ListingMapCanvasProps {
  readonly pins: readonly MapPinView[];
  /** El área buscada: el mapa arranca mostrándola. */
  readonly area: MapArea | undefined;
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string | undefined) => void;
  /** La persona movió o acercó el mapa: el área visible ahora. */
  readonly onMove: (area: MapArea) => void;
}

/**
 * Mapa del listado con OpenStreetMap (ADR 0019): un pin con el precio por propiedad, agrupados
 * cuando están cerca. Arranca en el área buscada o encuadrando todos los pines.
 */
export function ListingMapCanvas({
  pins,
  area,
  selectedId,
  onSelect,
  onMove,
}: ListingMapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const callbacks = useRef({ onSelect, onMove });
  const fittedAt = useRef(0);

  useEffect(() => {
    callbacks.current = { onSelect, onMove };
  }, [onSelect, onMove]);

  // El mapa se arma una vez; los pines cambian con cada búsqueda.
  useEffect(() => {
    if (!container.current || map.current) return undefined;
    const instance = L.map(container.current, {
      center: START.center,
      zoom: START.zoom,
      zoomControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      iconCreateFunction: clusterIcon,
    });
    group.addTo(instance);
    instance.on('click', () => {
      callbacks.current.onSelect(undefined);
    });
    instance.on('moveend', () => {
      if (Date.now() - fittedAt.current < FIT_SETTLE_MS) return;
      const bounds = instance.getBounds();
      callbacks.current.onMove({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    });
    map.current = instance;
    cluster.current = group;
    // Leaflet mide el contenedor al crearse; si el layout cambia después, se recalcula.
    const resize = new ResizeObserver(() => {
      // El `moveend` que dispara no es de la persona.
      fittedAt.current = Date.now();
      instance.invalidateSize();
    });
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      cluster.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = cluster.current;
    if (!instance || !group) return undefined;
    group.clearLayers();
    markers.current.clear();
    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: priceIcon(pin, false),
        title: `${pin.title}: ${pin.priceLabel}`,
        keyboard: true,
      });
      marker.on('click', () => {
        callbacks.current.onSelect(pin.id);
      });
      markers.current.set(pin.id, marker);
      group.addLayer(marker);
    }

    // Encuadre inicial: el área buscada o todos los pines. No cuenta como "la persona lo movió":
    // los `moveend` del encuadre (con su animación) se ignoran.
    fittedAt.current = Date.now();
    if (area) {
      instance.fitBounds([
        [area.south, area.west],
        [area.north, area.east],
      ]);
    } else if (pins.length > 0) {
      instance.fitBounds(
        L.latLngBounds(pins.map((pin): L.LatLngTuple => [pin.latitude, pin.longitude])),
        { padding: [40, 40], maxZoom: 15 },
      );
    }
    return undefined;
  }, [pins, area]);

  // Resalta el pin elegido.
  useEffect(() => {
    for (const pin of pins) {
      const marker = markers.current.get(pin.id);
      marker?.setIcon(priceIcon(pin, pin.id === selectedId));
      marker?.setZIndexOffset(pin.id === selectedId ? 1000 : 0);
    }
  }, [pins, selectedId]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Mapa de propiedades"
      className="isolate z-0 h-full w-full"
    />
  );
}
