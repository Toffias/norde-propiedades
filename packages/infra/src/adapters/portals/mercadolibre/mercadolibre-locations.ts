import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

// Ubicaciones de los avisos de MercadoLibre. ML no tiene búsqueda por nombre: se recorre su árbol
// público (país → "estado" → ciudad → barrio) y se compara con los nombres de nuestro catálogo.
// Buenos Aires está partida en regiones comerciales (Capital Federal, GBA Norte, Oeste, Sur, Costa
// Atlántica, Interior), así que una localidad de la provincia se busca en todas.

const NamedSchema = z.object({ id: z.string(), name: z.string() });
const CountrySchema = z.object({ states: z.array(NamedSchema) });
const StateSchema = z.object({ cities: z.array(NamedSchema) });
const CitySchema = z.object({ neighborhoods: z.array(NamedSchema) });

type Named = z.infer<typeof NamedSchema>;

export interface MlLocationQuery {
  readonly province: string | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
}

/** Lo que va en `location` del aviso: el barrio si lo encontramos, si no la ciudad. */
export type MlLocation =
  { readonly neighborhood: { readonly id: string } } | { readonly city: { readonly id: string } };

export type MlLocationError =
  | { readonly type: 'LocationNotFound'; readonly reason: string }
  | { readonly type: 'LocationUnavailable' };

const TIMEOUT_MS = 10_000;
/** El árbol de ubicaciones casi no cambia: se guarda un día en memoria. */
const CACHE_MS = 24 * 60 * 60 * 1000;

/** Minúsculas, sin acentos ni puntuación: "Bs.As. G.B.A. Norte" → "bs as g b a norte". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CAPITAL_ALIASES = new Set([
  'capital federal',
  'caba',
  'c a b a',
  'ciudad autonoma de buenos aires',
  'ciudad de buenos aires',
]);
const PROVINCE_ALIASES = new Set([
  'buenos aires',
  'provincia de buenos aires',
  'pcia de buenos aires',
]);

function isCapital(name: string | undefined) {
  return name !== undefined && CAPITAL_ALIASES.has(normalizeName(name));
}

/** Las regiones de ML que cubren la provincia de Buenos Aires (sin Capital Federal). */
function isProvinceRegion(state: Named): boolean {
  const name = normalizeName(state.name);
  return name.includes('g b a') || name.startsWith('bs as') || name === 'buenos aires interior';
}

export class MercadoLibreLocations {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #cache = new Map<string, { readonly at: number; readonly body: unknown }>();

  constructor(
    private readonly options: {
      readonly logger: InfraLogger;
      readonly now: () => number;
      readonly apiBaseUrl?: string;
      readonly fetch?: typeof fetch;
    },
  ) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.apiBaseUrl ?? 'https://api.mercadolibre.com';
  }

  async resolve(query: MlLocationQuery): Promise<Result<MlLocation, MlLocationError>> {
    const country = await this.#get('/classified_locations/countries/AR', CountrySchema);
    if (country.isErr()) return err(country.error);

    const capital = isCapital(query.province) || isCapital(query.city);
    const province = query.province === undefined ? '' : normalizeName(query.province);
    const states = country.value.states.filter((state) => {
      const name = normalizeName(state.name);
      if (capital) return name === 'capital federal';
      if (PROVINCE_ALIASES.has(province)) return isProvinceRegion(state);
      return name === province;
    });

    for (const state of states) {
      const detail = await this.#get(`/classified_locations/states/${state.id}`, StateSchema);
      if (detail.isErr()) return err(detail.error);
      // En Capital Federal hay una sola ciudad; nuestro catálogo puede llamarla "CABA".
      const city = capital
        ? detail.value.cities[0]
        : detail.value.cities.find((c) => sameName(c.name, query.city));
      if (!city) continue;
      return this.#inCity(city, query.neighborhood);
    }

    const place = [query.neighborhood, query.city, query.province].filter(Boolean).join(', ');
    return err({
      type: 'LocationNotFound',
      reason: `No encontramos "${place}" en las ubicaciones de MercadoLibre. Revisá la localidad de la propiedad.`,
    });
  }

  async #inCity(
    city: Named,
    neighborhood: string | undefined,
  ): Promise<Result<MlLocation, MlLocationError>> {
    if (neighborhood === undefined) return ok({ city: { id: city.id } });
    const detail = await this.#get(`/classified_locations/cities/${city.id}`, CitySchema);
    if (detail.isErr()) return err(detail.error);
    const found = detail.value.neighborhoods.find((n) => sameName(n.name, neighborhood));
    return ok(found ? { neighborhood: { id: found.id } } : { city: { id: city.id } });
  }

  async #get<T>(path: string, schema: z.ZodType<T>): Promise<Result<T, MlLocationError>> {
    const now = this.options.now();
    const cached = this.#cache.get(path);
    if (cached && now - cached.at < CACHE_MS) {
      const parsed = schema.safeParse(cached.body);
      if (parsed.success) return ok(parsed.data);
    }
    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.options.logger.warn(
          { path, status: response.status },
          'MercadoLibre locations failed',
        );
        return err({ type: 'LocationUnavailable' });
      }
      const body: unknown = await response.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        this.options.logger.error({ path }, 'Unexpected MercadoLibre locations response');
        return err({ type: 'LocationUnavailable' });
      }
      this.#cache.set(path, { at: now, body });
      return ok(parsed.data);
    } catch (error) {
      this.options.logger.error({ err: error, path }, 'MercadoLibre locations unreachable');
      return err({ type: 'LocationUnavailable' });
    }
  }
}

function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && normalizeName(a) === normalizeName(b);
}
