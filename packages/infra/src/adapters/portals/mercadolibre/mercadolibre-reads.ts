import type {
  PortalCredentialsMissingError,
  PortalId,
  PortalUnavailableError,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';

import type { InfraLogger } from '../../../shared/logger';

import type { MercadoLibreAccessTokens } from './mercadolibre-portal-connector';

export interface MercadoLibreReadsOptions {
  readonly tokens: MercadoLibreAccessTokens;
  readonly logger: InfraLogger;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

export type MercadoLibreReadError = PortalUnavailableError | PortalCredentialsMissingError;

const TIMEOUT_MS = 20_000;

/**
 * Lecturas (GET) de la API de MercadoLibre con el token de una cuenta. Un 401 pide reconectar; un
 * 5xx, un 429, otro 4xx o un error de red es "no respondió". Con `notFound`, un 404 devuelve
 * `undefined` en vez de un error. Loguea la ruta sin la query y nunca el token.
 */
export class MercadoLibreReads {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(private readonly options: MercadoLibreReadsOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.apiBaseUrl ?? 'https://api.mercadolibre.com';
  }

  async get(
    portal: PortalId,
    path: string,
    accept: { readonly notFound?: boolean } = {},
  ): Promise<Result<unknown, MercadoLibreReadError>> {
    const { logger, tokens } = this.options;
    const token = await tokens.accessToken(portal);
    if (token.isErr()) return err(token.error);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token.value}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error, portal, path: pathOnly(path) }, 'MercadoLibre unreachable');
      return err({ type: 'PortalUnavailable' });
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.ok) return ok(payload);
    if (response.status === 404 && accept.notFound === true) return ok(undefined);
    logger.warn(
      { portal, path: pathOnly(path), status: response.status },
      'MercadoLibre rejected a read',
    );
    return response.status === 401
      ? err({ type: 'PortalCredentialsMissing' })
      : err({ type: 'PortalUnavailable' });
  }

  /** Una respuesta que no se entiende: se loguea y se trata como "no respondió". */
  unexpected<T>(portal: PortalId, path: string): Result<T, MercadoLibreReadError> {
    this.options.logger.error({ portal, path: pathOnly(path) }, 'Unexpected MercadoLibre response');
    return err({ type: 'PortalUnavailable' });
  }
}

/** La ruta sin la query: los IDs y las fechas no aportan al log. */
function pathOnly(path: string): string {
  return path.split('?')[0] ?? path;
}
