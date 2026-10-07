import type {
  PortalConnector,
  PortalId,
  PortalListingContent,
  PortalListingState,
  PortalSyncError,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import {
  ML_LISTING_TYPES,
  categoryOf,
  listingAttributes,
  listingPictures,
  listingPrice,
  listingProblems,
  listingTitle,
  sellerContact,
} from './mercadolibre-listing';
import type { MercadoLibreLocations } from './mercadolibre-locations';

/** De dónde sale el token de cada cuenta (`MercadoLibreTokens`, con refresh bajo lock). */
export interface MercadoLibreAccessTokens {
  accessToken(
    portal: PortalId,
  ): Promise<
    Result<
      string,
      { readonly type: 'PortalCredentialsMissing' } | { readonly type: 'PortalUnavailable' }
    >
  >;
}

export interface MercadoLibrePortalConnectorOptions {
  readonly tokens: MercadoLibreAccessTokens;
  readonly locations: MercadoLibreLocations;
  readonly logger: InfraLogger;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

const CreatedSchema = z.object({ id: z.string(), permalink: z.string().optional() });
const ItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  listing_type_id: z.string(),
});
const ErrorSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
  cause: z
    .array(z.object({ code: z.string().optional(), message: z.string().optional() }).loose())
    .optional(),
});

const TIMEOUT_MS = 20_000;

type Call = Result<unknown, PortalSyncError>;

/**
 * Conector de MercadoLibre (inmuebles), por HTTP y sin SDK. Arma el aviso con
 * `mercadolibre-listing.ts`, resuelve la ubicación contra el árbol de ML y traduce las respuestas
 * al error del puerto: 4xx es un rechazo con su motivo, 429/5xx/red es "no respondió" (el job
 * reintenta) y 401 pide volver a conectar la cuenta. Nunca loguea tokens ni datos de contacto.
 */
export class MercadoLibrePortalConnector implements PortalConnector {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(private readonly options: MercadoLibrePortalConnectorOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.apiBaseUrl ?? 'https://api.mercadolibre.com';
  }

  problems(_portal: PortalId, content: PortalListingContent): readonly string[] {
    return listingProblems(content);
  }

  async create(
    portal: PortalId,
    content: PortalListingContent,
  ): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    const category = categoryOf(content.source.kind, content.operation);
    if (category === undefined) {
      return err({
        type: 'PortalRejected',
        reason: 'MercadoLibre no tiene categoría para este aviso.',
      });
    }
    const body = await this.#itemBody(content);
    if (body.isErr()) return err(body.error);
    const created = await this.#call(portal, 'POST', '/items', {
      ...body.value,
      category_id: category,
      available_quantity: 1,
      buying_mode: 'classified',
      condition: 'not_specified',
      listing_type_id: ML_LISTING_TYPES[content.listingType],
      channels: ['marketplace'],
      description: { plain_text: content.source.description },
    });
    if (created.isErr()) return err(created.error);
    const parsed = CreatedSchema.safeParse(created.value);
    if (!parsed.success) return this.#unexpected(portal, '/items');
    this.options.logger.info(
      { portal, externalId: parsed.data.id },
      'MercadoLibre listing created',
    );
    return ok({ externalId: parsed.data.id, permalink: parsed.data.permalink });
  }

  async update(
    portal: PortalId,
    externalId: string,
    change: {
      readonly content: PortalListingContent | undefined;
      readonly state: 'active' | 'paused';
    },
  ): Promise<Result<PortalListingState, PortalSyncError>> {
    const path = `/items/${encodeURIComponent(externalId)}`;
    const current = await this.#call(portal, 'GET', path);
    if (current.isErr()) return err(current.error);
    const item = ItemSchema.safeParse(current.value);
    if (!item.success) return this.#unexpected(portal, path);
    // Vencido o dado de baja en MercadoLibre: no se puede reactivar.
    if (item.data.status === 'closed') return ok('closed');

    const { content } = change;
    if (content) {
      const body = await this.#itemBody(content);
      if (body.isErr()) return err(body.error);
      const updated = await this.#call(portal, 'PUT', path, body.value);
      if (updated.isErr()) return err(updated.error);
      const description = await this.#call(portal, 'PUT', `${path}/description`, {
        plain_text: content.source.description,
      });
      if (description.isErr()) return err(description.error);
      const listingType = ML_LISTING_TYPES[content.listingType];
      if (item.data.listing_type_id !== listingType) {
        const upgraded = await this.#call(portal, 'POST', `${path}/listing_type`, {
          id: listingType,
        });
        if (upgraded.isErr()) return err(upgraded.error);
      }
    }

    if (item.data.status !== change.state) {
      const moved = await this.#call(portal, 'PUT', path, { status: change.state });
      if (moved.isErr()) return err(moved.error);
    }
    return ok(change.state);
  }

  async close(portal: PortalId, externalId: string): Promise<Result<void, PortalSyncError>> {
    const path = `/items/${encodeURIComponent(externalId)}`;
    const current = await this.#call(portal, 'GET', path);
    if (current.isErr()) return err(current.error);
    const item = ItemSchema.safeParse(current.value);
    if (item.success && item.data.status === 'closed') return ok(undefined);
    const closed = await this.#call(portal, 'PUT', path, { status: 'closed' });
    return closed.isErr() ? err(closed.error) : ok(undefined);
  }

  /** Lo que comparten el alta y la edición: título, precio, fotos, atributos, ubicación, contacto. */
  async #itemBody(content: PortalListingContent): Promise<Result<object, PortalSyncError>> {
    const { source } = content;
    const price = listingPrice(content);
    if (price === undefined) {
      return err({ type: 'PortalRejected', reason: 'La operación no tiene precio.' });
    }
    const location = await this.options.locations.resolve(source.location);
    if (location.isErr()) {
      return err(
        location.error.type === 'LocationNotFound'
          ? { type: 'PortalRejected', reason: location.error.reason }
          : { type: 'PortalUnavailable' },
      );
    }
    return ok({
      title: listingTitle(source),
      price: price.price,
      currency_id: price.currency,
      pictures: listingPictures(source),
      attributes: listingAttributes(content),
      location: {
        ...location.value,
        ...(source.address === undefined ? {} : { address_line: source.address }),
        ...(source.coordinates === undefined
          ? {}
          : { latitude: source.coordinates.latitude, longitude: source.coordinates.longitude }),
      },
      seller_contact: sellerContact(source),
    });
  }

  async #call(
    portal: PortalId,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: object,
  ): Promise<Call> {
    const { logger, tokens } = this.options;
    const token = await tokens.accessToken(portal);
    if (token.isErr()) return err(token.error);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token.value}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error, portal, method, path }, 'MercadoLibre unreachable');
      return err({ type: 'PortalUnavailable' });
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (response.ok) return ok(payload);

    const detail = ErrorSchema.safeParse(payload).data;
    const causes = (detail?.cause ?? []).map((c) => c.code).filter(Boolean);
    logger.warn(
      { portal, method, path, status: response.status, error: detail?.error, causes },
      'MercadoLibre rejected the request',
    );
    if (response.status === 401) return err({ type: 'PortalCredentialsMissing' });
    if (response.status === 429 || response.status >= 500)
      return err({ type: 'PortalUnavailable' });
    return err({ type: 'PortalRejected', reason: rejectionReason(detail, response.status) });
  }

  #unexpected<T>(portal: PortalId, path: string): Result<T, PortalSyncError> {
    this.options.logger.error({ portal, path }, 'Unexpected MercadoLibre response');
    return err({ type: 'PortalUnavailable' });
  }
}

/** El motivo para la ficha: los mensajes de cada causa, o el general de MercadoLibre. */
function rejectionReason(detail: z.infer<typeof ErrorSchema> | undefined, status: number): string {
  const messages = (detail?.cause ?? [])
    .map((c) => c.message)
    .filter((message): message is string => message !== undefined && message !== '');
  const text = messages.length > 0 ? messages.join(' ') : (detail?.message ?? `HTTP ${status}`);
  return `MercadoLibre rechazó el aviso: ${text}`;
}
