import { IMAGE_QUALITY, WARM_WIDTHS } from '../images/sizes';
import { isExternal } from './images';

interface WarmerLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export interface ImageWarmerDeps {
  /** Las rutas `/fotos/...` de las fotos y planos publicados de la propiedad (vacío si no se publica). */
  readonly photosOf: (propertyId: string) => Promise<readonly string[]>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** El origen público del sitio, donde responde `/_next/image`. */
  readonly origin: string;
  readonly logger: WarmerLogger;
}

/**
 * Precalienta el optimizador de `next/image` cuando cambia una propiedad: pide cada foto en los
 * anchos que usa el sitio para que la primera visita la encuentre convertida y en caché.
 *
 * Una propiedad a la vez y una foto a la vez, para no competir con las visitas por el CPU. Si la
 * misma propiedad se avisa varias veces mientras espera (reordenar la galería avisa por cada
 * foto), se calienta una sola vez. Las conversiones ya hechas responden de la caché al instante.
 */
export class ImageWarmer {
  private readonly queue = new Set<string>();
  private running: Promise<void> | undefined;

  constructor(private readonly deps: ImageWarmerDeps) {}

  /** Encola la propiedad y vuelve enseguida: el calentamiento sigue en segundo plano. */
  schedule(propertyId: string): void {
    this.queue.add(propertyId);
    this.running ??= this.drain().finally(() => {
      this.running = undefined;
    });
  }

  /** Termina cuando la cola se vacía (para los tests). */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async drain(): Promise<void> {
    for (const propertyId of this.queue) {
      this.queue.delete(propertyId);
      await this.warmProperty(propertyId);
    }
  }

  private async warmProperty(propertyId: string): Promise<void> {
    let photos: readonly string[];
    try {
      photos = await this.deps.photosOf(propertyId);
    } catch (error) {
      this.deps.logger.warn({ err: error, propertyId }, 'Could not list the photos to warm');
      return;
    }
    // Las fotos importadas sin archivo propio no pasan por el optimizador.
    for (const src of photos.filter((photo) => !isExternal(photo))) {
      for (const width of WARM_WIDTHS) await this.warm(src, width);
    }
  }

  private async warm(src: string, width: number): Promise<void> {
    const url = `${this.deps.origin}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${IMAGE_QUALITY}`;
    try {
      const response = await this.deps.fetch(url, { headers: { accept: 'image/webp' } });
      // Solo interesa que el optimizador la convierta y la guarde: los bytes se descartan.
      await response.arrayBuffer();
      if (!response.ok) {
        this.deps.logger.warn({ src, width, status: response.status }, 'Image warm-up failed');
      }
    } catch (error) {
      this.deps.logger.warn({ err: error, src, width }, 'Image warm-up failed');
    }
  }
}
