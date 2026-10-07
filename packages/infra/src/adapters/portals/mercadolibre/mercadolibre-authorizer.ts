import { createHash, randomBytes } from 'node:crypto';

import type {
  PortalAuthorizationError,
  PortalAuthorizationGrant,
  PortalAuthorizationRequest,
  PortalAuthorizer,
  PortalCredentials,
  PortalId,
  PortalNotConfiguredError,
} from '@norde/core/portals';
import { err, ok, type Clock, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

/** La app registrada en el DevCenter de MercadoLibre. */
export interface MercadoLibreAppConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Exactamente la registrada en la app (HTTPS). */
  readonly redirectUri: string;
}

export interface MercadoLibreAuthorizerOptions {
  /** Sin app configurada, conectar una cuenta devuelve `PortalNotConfigured`. */
  readonly app: MercadoLibreAppConfig | undefined;
  readonly clock: Clock;
  readonly logger: InfraLogger;
  readonly authBaseUrl?: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number(), z.string()]),
  // Sin `offline_access`, ML no devuelve refresh token: la cuenta se caería a las pocas horas.
  refresh_token: z.string().min(1).optional(),
});

const UserResponseSchema = z.object({
  id: z.union([z.number(), z.string()]),
  nickname: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

const TIMEOUT_MS = 15_000;

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * OAuth de MercadoLibre (authorization code + PKCE), por HTTP y sin SDK. Las dos cuentas de Norde
 * (propiedades y emprendimientos) usan la misma app; el portal que se conecta lo recuerda el panel.
 * Nunca loguea tokens ni códigos.
 */
export class MercadoLibreAuthorizer implements PortalAuthorizer {
  readonly #fetch: typeof fetch;
  readonly #authBaseUrl: string;
  readonly #apiBaseUrl: string;

  constructor(private readonly options: MercadoLibreAuthorizerOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#authBaseUrl = options.authBaseUrl ?? 'https://auth.mercadolibre.com.ar';
    this.#apiBaseUrl = options.apiBaseUrl ?? 'https://api.mercadolibre.com';
  }

  begin(_portal: PortalId): Result<PortalAuthorizationRequest, PortalNotConfiguredError> {
    const { app } = this.options;
    if (!app) return err({ type: 'PortalNotConfigured' });

    const state = base64Url(randomBytes(32));
    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
    const url = new URL('/authorization', this.#authBaseUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: app.clientId,
      redirect_uri: app.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return ok({ url: url.toString(), state, codeVerifier });
  }

  async complete(input: {
    readonly portal: PortalId;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<PortalAuthorizationGrant, PortalAuthorizationError>> {
    const { app, clock, logger } = this.options;
    if (!app) return err({ type: 'PortalNotConfigured' });

    const token = await this.#request(
      `${this.#apiBaseUrl}/oauth/token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: app.clientId,
          client_secret: app.clientSecret,
          code: input.code,
          redirect_uri: app.redirectUri,
          code_verifier: input.codeVerifier,
        }).toString(),
      },
      TokenResponseSchema,
      input.portal,
    );
    if (token.isErr()) return err(token.error);
    const { access_token: accessToken, refresh_token: refreshToken } = token.value;
    if (refreshToken === undefined) {
      logger.warn({ portal: input.portal }, 'MercadoLibre granted no refresh token');
      return err({
        type: 'PortalAuthorizationRejected',
        reason: 'La app de MercadoLibre no tiene el permiso offline_access.',
      });
    }
    const expiresAt = new Date(clock.now().getTime() + token.value.expires_in * 1000);

    const user = await this.#request(
      `${this.#apiBaseUrl}/users/me`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } },
      UserResponseSchema,
      input.portal,
    );
    if (user.isErr()) return err(user.error);

    const externalAccountId = String(user.value.id);
    logger.info({ portal: input.portal, externalAccountId }, 'MercadoLibre account authorized');
    return ok({
      credentials: { accessToken, refreshToken, expiresAt },
      externalAccountId,
      accountName: user.value.nickname,
    });
  }

  /**
   * Renueva el access token. El refresh token de ML es de un solo uso: la respuesta trae otro, que
   * hay que guardar enseguida (lo hace `MercadoLibreTokens`, con la fila bloqueada).
   */
  async refresh(
    portal: PortalId,
    refreshToken: string,
  ): Promise<Result<PortalCredentials, PortalAuthorizationError>> {
    const { app, clock } = this.options;
    if (!app) return err({ type: 'PortalNotConfigured' });
    const token = await this.#request(
      `${this.#apiBaseUrl}/oauth/token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: app.clientId,
          client_secret: app.clientSecret,
          refresh_token: refreshToken,
        }).toString(),
      },
      TokenResponseSchema,
      portal,
    );
    if (token.isErr()) return err(token.error);
    return ok({
      accessToken: token.value.access_token,
      // Si ML no rota el token (no debería), el anterior sigue sirviendo.
      refreshToken: token.value.refresh_token ?? refreshToken,
      expiresAt: new Date(clock.now().getTime() + token.value.expires_in * 1000),
    });
  }

  async #request<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    portal: PortalId,
  ): Promise<Result<T, PortalAuthorizationError>> {
    const { logger } = this.options;
    const endpoint = new URL(url).pathname;
    let response: Response;
    try {
      response = await this.#fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      logger.error({ err: error, portal, endpoint }, 'MercadoLibre unreachable');
      return err({ type: 'PortalUnavailable' });
    }

    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail = ErrorResponseSchema.safeParse(body).data;
      logger.warn(
        { portal, endpoint, status: response.status, error: detail?.error },
        'MercadoLibre rejected the request',
      );
      if (response.status === 429 || response.status >= 500) {
        return err({ type: 'PortalUnavailable' });
      }
      return err({
        type: 'PortalAuthorizationRejected',
        reason: detail?.error ?? `http ${response.status}`,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      logger.error({ portal, endpoint }, 'Unexpected MercadoLibre response');
      return err({ type: 'PortalUnavailable' });
    }
    return ok(parsed.data);
  }
}
