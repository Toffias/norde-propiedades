import type {
  DownloadedPhoto,
  PhotoUnavailableError,
  TokkoApiPage,
  TokkoApiProperty,
  TokkoPropertySource,
  TokkoUnavailableError,
} from '@norde/core/properties';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../shared/logger';

/** La API key de Norde en Tokko (Mi empresa → Permisos). */
export interface TokkoApiConfig {
  readonly apiKey: string;
  /** `https://www.tokkobroker.com/api/v1`; se cambia solo en los tests. */
  readonly baseUrl?: string;
}

export interface TokkoPropertyApiOptions {
  readonly config: TokkoApiConfig;
  readonly logger: InfraLogger;
  readonly fetch?: typeof fetch;
  /** Espera entre reintentos; en los tests no espera. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = 'https://www.tokkobroker.com/api/v1';
/** Las fotos se bajan solo de acá: nunca de una URL que venga de otro lado. */
const PHOTO_HOST = 'static.tokkobroker.com';
const PAGE_TIMEOUT_MS = 60_000;
const PHOTO_TIMEOUT_MS = 30_000;
/** Lo que pesa como mucho una foto en Norde (`MAX_MEDIA_BYTES`); más no se baja. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Esperas antes de cada reintento: Tokko a veces responde 503 por un rato. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

const text = z.string().nullish();
const number = z.number().nullish();

// Lo que Norde lee de `/api/v1/property/` (Tokko manda mucho más). Todo puede venir vacío o null.
const PropertySchema = z.object({
  reference_code: text,
  type: z.object({ name: text }).nullish(),
  address: text,
  real_address: text,
  floor: text,
  apartment_door: text,
  location: z.object({ full_location: text }).nullish(),
  producer: z.object({ name: text }).nullish(),
  operations: z
    .array(
      z.object({
        operation_id: z.number(),
        prices: z.array(z.object({ currency: text, price: number })).nullish(),
      }),
    )
    .nullish(),
  web_price: z.boolean().nullish(),
  total_surface: text,
  surface: text,
  roofed_surface: text,
  semiroofed_surface: text,
  unroofed_surface: text,
  front_measure: text,
  depth_measure: text,
  room_amount: number,
  suite_amount: number,
  bathroom_amount: number,
  toilet_amount: number,
  parking_lot_amount: number,
  age: number,
  expenses: number,
  floors_amount: number,
  zonification: text,
  publication_title: text,
  description: text,
  description_only: text,
  geo_lat: z.union([z.string(), z.number()]).nullish(),
  geo_long: z.union([z.string(), z.number()]).nullish(),
  internal_data: z
    .object({
      internal_comments: text,
      property_owners: z
        .array(z.object({ name: text, cellphone: text, phone: text, email: text }))
        .nullish(),
    })
    .nullish(),
  development: z.object({ name: text }).nullish(),
  photos: z
    .array(
      z.object({
        original: text,
        image: text,
        order: number,
        is_front_cover: z.boolean().nullish(),
        is_blueprint: z.boolean().nullish(),
      }),
    )
    .nullish(),
});
type RawProperty = z.infer<typeof PropertySchema>;

// Los links `next` y `previous` de `meta` llevan la API key: no se leen ni se loguean.
const PageSchema = z.object({
  meta: z.object({ total_count: z.number().int().min(0) }),
  objects: z.array(z.unknown()),
});

/** Un texto sin espacios de más; vacío es "sin dato". */
function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function coordinate(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Una propiedad de Tokko en la forma del puerto, sin interpretarla: eso lo hace el core. */
function toProperty(raw: RawProperty): TokkoApiProperty {
  const internal = raw.internal_data;
  return {
    referenceCode: raw.reference_code ?? '',
    typeName: raw.type?.name ?? '',
    address: clean(raw.real_address) ?? raw.address ?? '',
    floor: clean(raw.floor),
    unit: clean(raw.apartment_door),
    fullLocation: raw.location?.full_location ?? '',
    producerName: clean(raw.producer?.name),
    operations: (raw.operations ?? []).map((operation) => ({
      operationId: operation.operation_id,
      prices: (operation.prices ?? []).map((price) => ({
        currency: price.currency ?? '',
        amount: price.price ?? 0,
      })),
    })),
    showPrice: raw.web_price ?? true,
    surfaceTotal: clean(raw.total_surface),
    surfaceLand: clean(raw.surface),
    surfaceCovered: clean(raw.roofed_surface),
    surfaceSemiCovered: clean(raw.semiroofed_surface),
    surfaceUncovered: clean(raw.unroofed_surface),
    front: clean(raw.front_measure),
    depth: clean(raw.depth_measure),
    rooms: raw.room_amount ?? undefined,
    bedrooms: raw.suite_amount ?? undefined,
    bathrooms: raw.bathroom_amount ?? undefined,
    toilets: raw.toilet_amount ?? undefined,
    parkingSpaces: raw.parking_lot_amount ?? undefined,
    age: raw.age ?? undefined,
    expenses: raw.expenses ?? undefined,
    floors: raw.floors_amount ?? undefined,
    zoning: clean(raw.zonification),
    title: clean(raw.publication_title),
    // `description` puede traer el pie de la inmobiliaria; `description_only`, no.
    description: clean(raw.description_only) ?? clean(raw.description),
    internalComments: clean(internal?.internal_comments),
    latitude: coordinate(raw.geo_lat),
    longitude: coordinate(raw.geo_long),
    owners: (internal?.property_owners ?? []).map((owner) => ({
      name: clean(owner.name) ?? '',
      phone: clean(owner.cellphone) ?? clean(owner.phone),
      email: clean(owner.email),
    })),
    developmentName: clean(raw.development?.name),
    photos: (raw.photos ?? []).flatMap((photo, index) => {
      const url = clean(photo.original) ?? clean(photo.image);
      if (url === undefined) return [];
      const fallbackUrl = clean(photo.image);
      return [
        {
          url,
          fallbackUrl: fallbackUrl === url ? undefined : fallbackUrl,
          order: photo.order ?? index,
          isCover: photo.is_front_cover ?? false,
          isFloorPlan: photo.is_blueprint ?? false,
        },
      ];
    }),
  };
}

/**
 * Cliente de la API de Tokko (`/api/v1/`), sin SDK, para importar las propiedades de Norde. La key
 * va en la URL, como pide Tokko: por eso nunca se loguea una URL del listado, solo el estado HTTP.
 * Reintenta unas veces si Tokko no responde o responde un error del servidor.
 */
export class TokkoPropertyApi implements TokkoPropertySource {
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #baseUrl: string;

  constructor(private readonly options: TokkoPropertyApiOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#baseUrl = (options.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async page(offset: number, limit: number): Promise<Result<TokkoApiPage, TokkoUnavailableError>> {
    const url = new URL(`${this.#baseUrl}/property/`);
    url.search = new URLSearchParams({
      key: this.options.config.apiKey,
      format: 'json',
      lang: 'es_ar',
      offset: String(offset),
      limit: String(limit),
    }).toString();

    const body = await this.#getJson(url);
    if (body === undefined) return err({ type: 'TokkoUnavailable' });
    const page = PageSchema.safeParse(body);
    if (!page.success) {
      this.options.logger.error({ offset }, 'Tokko property page has an unexpected shape');
      return err({ type: 'TokkoUnavailable' });
    }
    const properties = page.data.objects.map((object, index) => {
      const parsed = PropertySchema.safeParse(object);
      if (parsed.success) return toProperty(parsed.data);
      // Sin código ni tipo, el core la informa como un problema de esa fila y sigue con las demás.
      this.options.logger.warn(
        { position: offset + index + 1, issues: parsed.error.issues.length },
        'Tokko property has an unexpected shape',
      );
      return toProperty({});
    });
    return ok({ total: page.data.meta.total_count, properties });
  }

  async photo(rawUrl: string): Promise<Result<DownloadedPhoto, PhotoUnavailableError>> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      // No es una URL: no hay nada que bajar.
      return err({ type: 'PhotoUnavailable' });
    }
    if (url.protocol !== 'https:' || url.hostname !== PHOTO_HOST || url.username !== '') {
      this.options.logger.warn({ host: url.hostname }, 'Tokko photo outside the Tokko servers');
      return err({ type: 'PhotoUnavailable' });
    }
    try {
      const response = await this.#fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (!response.ok || declared > MAX_PHOTO_BYTES) {
        this.options.logger.warn(
          { status: response.status, path: url.pathname },
          'Tokko photo not downloaded',
        );
        return err({ type: 'PhotoUnavailable' });
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES || contentType === '') {
        return err({ type: 'PhotoUnavailable' });
      }
      return ok({ bytes, contentType });
    } catch (error) {
      this.options.logger.warn(
        { path: url.pathname, error: error instanceof Error ? error.name : 'unknown' },
        'Tokko photo not downloaded',
      );
      return err({ type: 'PhotoUnavailable' });
    }
  }

  /** El JSON de un `GET`, con reintentos. `undefined` si Tokko no respondió bien. */
  async #getJson(url: URL): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      let status: number | undefined;
      try {
        const response = await this.#fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
        status = response.status;
        if (response.ok) {
          // `json()` devuelve `any`: se pasa como `unknown` y se valida con Zod.
          const body: unknown = await response.json();
          return body;
        }
        // La key rechazada o un pedido mal armado no se arreglan reintentando.
        if (status < 500 && status !== 429) {
          this.options.logger.error(
            { status, path: url.pathname },
            'Tokko API rejected the request',
          );
          return undefined;
        }
      } catch (error) {
        this.options.logger.warn(
          { path: url.pathname, error: error instanceof Error ? error.name : 'unknown' },
          'Tokko API did not answer',
        );
      }
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        this.options.logger.error({ status, path: url.pathname }, 'Tokko API unavailable');
        return undefined;
      }
      await this.#sleep(delay);
    }
  }
}
