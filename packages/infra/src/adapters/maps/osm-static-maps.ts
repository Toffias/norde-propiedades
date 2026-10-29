import type { StaticMaps } from '@norde/core/properties';
import sharp from 'sharp';

import type { InfraLogger } from '../../shared/logger';

const TILE = 256;
/** Calles y manzanas se leen bien; el barrio se reconoce alrededor. */
const ZOOM = 16;
/** Apaisada (2:1): el PDF la recorta a su recuadro. */
const WIDTH = 1024;
const HEIGHT = 512;
/** Teselas en memoria: las propiedades de un mismo barrio comparten las suyas. */
const CACHE_SIZE = 400;
const CONCURRENCY = 4;

export interface OsmStaticMapsOptions {
  /** La misma política que Nominatim: la app y un contacto en cada pedido. */
  readonly userAgent: string;
  readonly logger: InfraLogger;
  /** Plantilla `{z}/{x}/{y}` de otro proveedor de teselas; sin ella, las públicas de OpenStreetMap. */
  readonly tileUrl?: string | undefined;
  readonly fetch?: typeof fetch;
}

/** El marcador: la gota roja de la marca, con la punta en el centro de la imagen. */
const PIN = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64" viewBox="0 0 24 32">
    <path d="M12 31c-1-3.5-10-11-10-19a10 10 0 0 1 20 0c0 8-9 15.5-10 19z" fill="#c9302b" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="#ffffff"/>
  </svg>`,
);

/** La atribución que pide la licencia de OpenStreetMap, en la esquina. */
function attribution(text: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(text.length * 7 + 16).toString()}" height="22">
      <rect width="100%" height="100%" fill="#ffffff" fill-opacity="0.8"/>
      <text x="8" y="15" font-family="sans-serif" font-size="12" fill="#333333">${text}</text>
    </svg>`,
  );
}

/** Coordenadas de mundo (en píxeles, a este zoom) de un punto, en Web Mercator. */
function worldPixels(latitude: number, longitude: number): { x: number; y: number } {
  const scale = TILE * 2 ** ZOOM;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Mapa estático para los PDF (#175), armado con las teselas de OpenStreetMap (las mismas del mapa
 * del panel, ADR 0019) y el marcador en la ubicación exacta. Las teselas públicas son para uso
 * moderado: se piden de a pocas, con timeout, y quedan en memoria; si el volumen crece, se cambia
 * `tileUrl` por un proveedor. Si alguna falla, no hay mapa y el PDF sale con una foto.
 */
export class OsmStaticMaps implements StaticMaps {
  readonly #fetch: typeof fetch;
  readonly #tileUrl: string;
  readonly #cache = new Map<string, Buffer>();

  constructor(private readonly options: OsmStaticMapsOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#tileUrl = options.tileUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  async render(point: {
    readonly latitude: number;
    readonly longitude: number;
  }): Promise<Uint8Array | undefined> {
    const center = worldPixels(point.latitude, point.longitude);
    const left = Math.round(center.x - WIDTH / 2);
    const top = Math.round(center.y - HEIGHT / 2);
    const first = { x: Math.floor(left / TILE), y: Math.floor(top / TILE) };
    const last = {
      x: Math.floor((left + WIDTH - 1) / TILE),
      y: Math.floor((top + HEIGHT - 1) / TILE),
    };
    const positions: { x: number; y: number }[] = [];
    for (let y = first.y; y <= last.y; y += 1) {
      for (let x = first.x; x <= last.x; x += 1) positions.push({ x, y });
    }

    const tiles: (Buffer | undefined)[] = [];
    for (let index = 0; index < positions.length; index += CONCURRENCY) {
      const batch = positions.slice(index, index + CONCURRENCY);
      tiles.push(...(await Promise.all(batch.map((tile) => this.#tile(tile.x, tile.y)))));
    }
    if (tiles.some((tile) => tile === undefined)) return undefined;

    const columns = last.x - first.x + 1;
    const rows = last.y - first.y + 1;
    const canvas = await sharp({
      create: {
        width: columns * TILE,
        height: rows * TILE,
        channels: 3,
        background: '#f2efe9',
      },
    })
      .composite(
        positions.map((tile, index) => ({
          input: tiles[index] ?? Buffer.alloc(0),
          left: (tile.x - first.x) * TILE,
          top: (tile.y - first.y) * TILE,
        })),
      )
      .png()
      .toBuffer();

    const label = attribution('© OpenStreetMap');
    const labelWidth = (await sharp(label).metadata()).width;
    const map = await sharp(canvas)
      .extract({
        left: left - first.x * TILE,
        top: top - first.y * TILE,
        width: WIDTH,
        height: HEIGHT,
      })
      .composite([
        { input: PIN, left: WIDTH / 2 - 24, top: HEIGHT / 2 - 64 },
        { input: label, left: WIDTH - labelWidth, top: HEIGHT - 22 },
      ])
      .png()
      .toBuffer();
    return new Uint8Array(map);
  }

  async #tile(x: number, y: number): Promise<Buffer | undefined> {
    const key = `${ZOOM.toString()}/${x.toString()}/${y.toString()}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;
    const url = this.#tileUrl
      .replace('{z}', ZOOM.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());
    try {
      const response = await this.#fetch(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'image/png' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        this.options.logger.warn({ status: response.status }, 'Map tile request failed');
        return undefined;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (this.#cache.size >= CACHE_SIZE) {
        const oldest = this.#cache.keys().next().value;
        if (oldest !== undefined) this.#cache.delete(oldest);
      }
      this.#cache.set(key, bytes);
      return bytes;
    } catch (error) {
      this.options.logger.warn({ err: error }, 'Map tile request failed');
      return undefined;
    }
  }
}
