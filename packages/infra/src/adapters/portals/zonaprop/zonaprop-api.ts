import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

/** Las credenciales de integrador que Zonaprop (Open Navent) le dio a Norde. */
export interface ZonapropApiConfig {
  /** `https://api-zp-open.navent.com` en producción; el sandbox tiene otra URL. */
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface ZonapropApiOptions {
  /** Sin credenciales configuradas, toda llamada devuelve `not_configured`. */
  readonly config: ZonapropApiConfig | undefined;
  readonly logger: InfraLogger;
  /** Milisegundos desde epoch (el `Clock` del container). */
  readonly now: () => number;
  /** Identifica a Norde en cada pedido, como pide Open Navent. */
  readonly userAgent: string;
  readonly fetch?: typeof fetch;
}

/**
 * Lo que puede salir mal en una llamada:
 * - `not_configured`: faltan las credenciales, o Zonaprop las rechazó.
 * - `forbidden`: la cuenta no está asociada a Norde como integrador.
 * - `not_found`: no existe lo pedido.
 * - `unavailable`: Zonaprop no respondió o respondió con un error (el sandbox se apaga de noche).
 */
export type ZonapropApiError =
  | { readonly type: 'not_configured' }
  | { readonly type: 'forbidden' }
  | { readonly type: 'not_found' }
  | { readonly type: 'unavailable' };

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

interface AccessToken {
  readonly value: string;
  readonly expiresAt: number;
}

const ErrorBodySchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

const TIMEOUT_MS = 15_000;
const REASON_MAX_LENGTH = 200;

/**
 * El motivo de un error, para el log: solo el código de error de la respuesta (`invalid_token`),
 * recortado. Nunca el mensaje: Open Navent repite ahí el token que recibió.
 */
async function errorReason(response: Response): Promise<string | undefined> {
  try {
    const parsed = ErrorBodySchema.safeParse(await response.json());
    if (!parsed.success) return undefined;
    const reason = parsed.data.error ?? parsed.data.code;
    return reason?.slice(0, REASON_MAX_LENGTH);
  } catch {
    // El cuerpo no es JSON (un HTML del balanceador, por ejemplo): no hay motivo que mostrar.
    return undefined;
  }
}
/** Se renueva un poco antes de que venza. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/**
 * Cliente HTTP de la API de Open Navent para Zonaprop, sin SDK. Se autentica con las credenciales
 * de integrador (`client_credentials`) y guarda el token en memoria: no es de una cuenta, así que
 * no va a la base. Si Zonaprop lo rechaza, pide otro una vez. Nunca loguea el token ni el secreto
 * (el login los manda en la URL, así que se loguea solo la ruta).
 */
export class ZonapropApi {
  readonly #fetch: typeof fetch;
  #token: AccessToken | undefined;
  #login: Promise<Result<AccessToken, ZonapropApiError>> | undefined;

  constructor(private readonly options: ZonapropApiOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  /** `GET` a la API. `undefined` si Zonaprop respondió sin contenido (204). */
  async get<T>(
    path: string,
    schema: z.ZodType<T>,
  ): Promise<Result<T | undefined, ZonapropApiError>> {
    const first = await this.#authorizedGet(path, schema, false);
    if (first.isErr() && first.error.type === 'unauthorized') {
      this.#token = undefined;
      return this.#unwrapRetry(await this.#authorizedGet(path, schema, true));
    }
    return this.#unwrapRetry(first);
  }

  #unwrapRetry<T>(
    result: Result<T, ZonapropApiError | { readonly type: 'unauthorized' }>,
  ): Result<T, ZonapropApiError> {
    if (result.isOk()) return ok(result.value);
    return err(result.error.type === 'unauthorized' ? { type: 'not_configured' } : result.error);
  }

  async #authorizedGet<T>(
    path: string,
    schema: z.ZodType<T>,
    retried: boolean,
  ): Promise<Result<T | undefined, ZonapropApiError | { readonly type: 'unauthorized' }>> {
    const { config, logger } = this.options;
    if (!config) return err({ type: 'not_configured' });
    const token = await this.#accessToken();
    if (token.isErr()) return err(token.error);

    const url = new URL(path, config.baseUrl);
    url.searchParams.set('access_token', token.value.value);
    const response = await this.#send(url, { headers: { Accept: 'application/json' } });
    if (response.isErr()) return err(response.error);
    const { status } = response.value;
    if (status === 401) {
      if (retried) {
        const reason = await errorReason(response.value);
        logger.warn({ endpoint: url.pathname, reason }, 'Zonaprop rejected a fresh token');
      }
      return err({ type: 'unauthorized' });
    }
    if (status === 403) return err({ type: 'forbidden' });
    if (status === 404) return err({ type: 'not_found' });
    if (status === 204) return ok(undefined);
    if (!response.value.ok) {
      const reason = await errorReason(response.value);
      logger.error({ endpoint: url.pathname, status, reason }, 'Zonaprop request failed');
      return err({ type: 'unavailable' });
    }
    return this.#parse(response.value, schema, url.pathname);
  }

  /** El token vigente, o uno nuevo. Pedidos simultáneos comparten el mismo login. */
  async #accessToken(): Promise<Result<AccessToken, ZonapropApiError>> {
    const token = this.#token;
    if (token && token.expiresAt - EXPIRY_MARGIN_MS > this.options.now()) return ok(token);
    this.#login ??= this.#requestToken().finally(() => {
      this.#login = undefined;
    });
    const result = await this.#login;
    if (result.isOk()) this.#token = result.value;
    return result;
  }

  async #requestToken(): Promise<Result<AccessToken, ZonapropApiError>> {
    const { config, logger, now } = this.options;
    if (!config) return err({ type: 'not_configured' });
    const url = new URL('/v1/application/login', config.baseUrl);
    url.search = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString();

    const response = await this.#send(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (response.isErr()) return err(response.error);
    const { status } = response.value;
    if (status === 400 || status === 401 || status === 403) {
      logger.error(
        { endpoint: url.pathname, status },
        'Zonaprop rejected the integrator credentials',
      );
      return err({ type: 'not_configured' });
    }
    if (!response.value.ok) {
      logger.error({ endpoint: url.pathname, status }, 'Zonaprop login failed');
      return err({ type: 'unavailable' });
    }
    const body = await this.#parse(response.value, TokenResponseSchema, url.pathname);
    if (body.isErr()) return err(body.error);
    return ok({
      value: body.value.access_token,
      expiresAt: now() + body.value.expires_in * 1000,
    });
  }

  async #send(
    url: URL,
    init: { readonly method?: string; readonly headers: Readonly<Record<string, string>> },
  ): Promise<Result<Response, ZonapropApiError>> {
    try {
      const response = await this.#fetch(url, {
        ...init,
        headers: { ...init.headers, 'User-Agent': this.options.userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return ok(response);
    } catch (error) {
      this.options.logger.error({ err: error, endpoint: url.pathname }, 'Zonaprop unreachable');
      return err({ type: 'unavailable' });
    }
  }

  async #parse<T>(
    response: Response,
    schema: z.ZodType<T>,
    endpoint: string,
  ): Promise<Result<T, ZonapropApiError>> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      this.options.logger.error({ err: error, endpoint }, 'Zonaprop returned invalid JSON');
      return err({ type: 'unavailable' });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.options.logger.error(
        { endpoint, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        'Zonaprop returned an unexpected response',
      );
      return err({ type: 'unavailable' });
    }
    return ok(parsed.data);
  }
}
