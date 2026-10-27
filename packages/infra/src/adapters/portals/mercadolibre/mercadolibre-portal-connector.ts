import type {
  DevelopmentListingContent,
  ListingSource,
  ListingSourceContact,
  PortalConnector,
  PortalId,
  PortalListingContent,
  PortalListingUpdate,
  PortalSyncError,
  PropertyListingContent,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import {
  developmentCategory,
  developmentItem,
  developmentProblems,
  developmentUnits,
  type ExistingVariation,
} from './mercadolibre-development';
import {
  ML_LISTING_TYPES,
  categoryOf,
  listingAttributes,
  listingPictures,
  listingPrice,
  listingProblems,
  listingTitle,
  listingTypeOf,
  sellerContact,
} from './mercadolibre-listing';
import type { MercadoLibreLocations } from './mercadolibre-locations';

const NO_DEVELOPMENT_PACKAGE =
  'La cuenta no tiene un paquete de emprendimientos activo con cupo: MercadoLibre lo activa a pedido, para un solo emprendimiento por paquete.';

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

/**
 * Los estados en que MercadoLibre no deja activar el aviso: pedirlo da 400. El aviso queda pausado
 * con el motivo hasta que se resuelva en la cuenta de ML (la conciliación lo ve cuando pasa).
 */
const NOT_ACTIVATABLE: Readonly<Record<string, string>> = {
  under_review:
    'MercadoLibre está revisando el aviso: no se puede activar hasta que termine. Revisalo en la cuenta de MercadoLibre.',
  inactive:
    'MercadoLibre inactivó el aviso: no se puede activar desde Norde. Revisalo en la cuenta de MercadoLibre.',
  payment_required: 'MercadoLibre espera un pago para mostrar el aviso.',
};
const MODERATION_PENALTY =
  'MercadoLibre pausó el aviso por moderación: no se puede activar desde Norde. Revisalo en la cuenta de MercadoLibre.';

const CreatedSchema = z.object({ id: z.string(), permalink: z.string().optional() });
const ItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  listing_type_id: z.string(),
  tags: z.array(z.string()).nullish(),
  variations: z
    .array(z.object({ id: z.number(), seller_custom_field: z.string().nullish() }).loose())
    .nullish(),
});
const MeSchema = z.object({ id: z.union([z.number(), z.string()]).transform(String) });
const SearchSchema = z.object({ results: z.array(z.string()) }).loose();
const DevelopmentPacksSchema = z.array(
  z
    .object({
      listing_details: z
        .array(
          z
            .object({
              listing_type_id: z.string(),
              remaining_listings: z.number().nullish(),
            })
            .loose(),
        )
        .nullish(),
    })
    .loose(),
);
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
    return content.kind === 'development' ? developmentProblems(content) : listingProblems(content);
  }

  async create(
    portal: PortalId,
    content: PortalListingContent,
  ): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    if (content.kind === 'development') return this.#createDevelopment(portal, content);
    const category = categoryOf(content.source.kind, content.operation);
    if (category === undefined) {
      return err({
        type: 'PortalRejected',
        reason: 'MercadoLibre no tiene categoría para este aviso.',
      });
    }
    const body = await this.#itemBody(content);
    if (body.isErr()) return err(body.error);
    const user = await this.#userId(portal);
    if (user.isErr()) return err(user.error);
    const existing = await this.#createdBefore(portal, user.value, content.listingId);
    if (existing.isErr()) return err(existing.error);
    if (existing.value !== undefined) return ok(existing.value);
    const created = await this.#call(portal, 'POST', '/items', {
      ...body.value,
      seller_custom_field: content.listingId,
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
      readonly content: PortalListingContent;
      readonly contentChanged: boolean;
      readonly state: 'active' | 'paused';
    },
  ): Promise<Result<PortalListingUpdate, PortalSyncError>> {
    const path = `/items/${encodeURIComponent(externalId)}`;
    const current = await this.#call(portal, 'GET', path);
    if (current.isErr()) return err(current.error);
    const item = ItemSchema.safeParse(current.value);
    if (!item.success) return this.#unexpected(portal, path);
    // Vencido o dado de baja en MercadoLibre: no se puede reactivar.
    if (item.data.status === 'closed') return ok({ state: 'closed', permalink: undefined });

    // ML guarda el contenido aunque el aviso esté pausado: solo se manda si cambió.
    const content = change.contentChanged ? change.content : undefined;
    if (content?.kind === 'development') {
      // Sin unidades el emprendimiento solo se pausa: ML no admite un aviso sin variaciones.
      if (developmentUnits(content.source).length > 0) {
        const existing = (item.data.variations ?? []).map((v) => ({
          id: v.id,
          unitId: v.seller_custom_field ?? undefined,
        }));
        const sent = await this.#sendDevelopment(portal, path, content, existing);
        if (sent.isErr()) return err(sent.error);
      }
    } else if (content) {
      const body = await this.#itemBody(content);
      if (body.isErr()) return err(body.error);
      const updated = await this.#call(portal, 'PUT', path, body.value);
      if (updated.isErr()) return err(updated.error);
      const description = await this.#call(portal, 'PUT', `${path}/description`, {
        plain_text: content.source.description,
      });
      if (description.isErr()) return err(description.error);
      // Se compara simple contra destacado: un aviso vinculado de Tokko en `gold` o `gold_special`
      // ya es destacado y no se pasa a `gold_premium` (otro costo y otro cupo).
      if (listingTypeOf(item.data.listing_type_id) !== content.listingType) {
        const upgraded = await this.#call(portal, 'POST', `${path}/listing_type`, {
          id: ML_LISTING_TYPES[content.listingType],
        });
        if (upgraded.isErr()) return err(upgraded.error);
      }
    }

    const blocked = blockedReason(item.data);
    if (change.state === 'active' && blocked !== undefined) {
      return ok({ state: 'paused', permalink: undefined, reason: blocked });
    }
    if (item.data.status !== change.state && blocked === undefined) {
      const moved = await this.#call(portal, 'PUT', path, { status: change.state });
      if (moved.isErr()) return err(moved.error);
    }
    return ok({ state: change.state, permalink: undefined });
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
  async #itemBody(content: PropertyListingContent): Promise<Result<object, PortalSyncError>> {
    const { source } = content;
    const price = listingPrice(content);
    if (price === undefined) {
      return err({ type: 'PortalRejected', reason: 'La operación no tiene precio.' });
    }
    const place = await this.#place(source);
    if (place.isErr()) return err(place.error);
    return ok({
      title: listingTitle(source),
      price: price.price,
      currency_id: price.currency,
      pictures: listingPictures(source),
      attributes: listingAttributes(content),
      ...place.value,
    });
  }

  /** La ubicación (contra el árbol de ML) y el contacto del aviso. */
  async #place(source: {
    readonly location: ListingSource['location'];
    readonly address: string | undefined;
    readonly coordinates: ListingSource['coordinates'];
    readonly contact: ListingSourceContact;
  }): Promise<Result<object, PortalSyncError>> {
    const location = await this.options.locations.resolve(source.location);
    if (location.isErr()) {
      return err(
        location.error.type === 'LocationNotFound'
          ? { type: 'PortalRejected', reason: location.error.reason }
          : { type: 'PortalUnavailable' },
      );
    }
    return ok({
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

  /**
   * Publica el emprendimiento: un ítem en "Emprendimientos" con las unidades como variaciones. El
   * tipo de aviso es el del paquete de emprendimientos de la cuenta (ML lo da a pedido).
   */
  async #createDevelopment(
    portal: PortalId,
    content: DevelopmentListingContent,
  ): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    const category = developmentCategory(content.source);
    if (category === undefined) {
      return err({
        type: 'PortalRejected',
        reason: 'MercadoLibre no tiene categoría de emprendimientos para estas unidades.',
      });
    }
    const user = await this.#userId(portal);
    if (user.isErr()) return err(user.error);
    // Antes que el cupo: un aviso que ya se creó ya lo consumió.
    const existing = await this.#createdBefore(portal, user.value, content.listingId);
    if (existing.isErr()) return err(existing.error);
    if (existing.value !== undefined) return ok(existing.value);
    const listingType = await this.#developmentListingType(portal, user.value);
    if (listingType.isErr()) return err(listingType.error);
    const place = await this.#place(content.source);
    if (place.isErr()) return err(place.error);
    const item = developmentItem(content);
    const created = await this.#call(portal, 'POST', '/items', {
      ...item,
      ...place.value,
      seller_custom_field: content.listingId,
      category_id: category,
      available_quantity: item.variations.length,
      buying_mode: 'classified',
      condition: 'new',
      listing_type_id: listingType.value,
      channels: ['marketplace'],
      description: { plain_text: content.source.description },
    });
    if (created.isErr()) return err(created.error);
    const parsed = CreatedSchema.safeParse(created.value);
    if (!parsed.success) return this.#unexpected(portal, '/items');
    this.options.logger.info(
      { portal, externalId: parsed.data.id, units: item.variations.length },
      'MercadoLibre development listing created',
    );
    return ok({ externalId: parsed.data.id, permalink: parsed.data.permalink });
  }

  /**
   * Manda el contenido del emprendimiento: las variaciones ya publicadas van con su ID (se
   * reconocen por la unidad), las nuevas sin ID y las que no van, ML las borra. El precio lo lleva
   * cada variación.
   */
  async #sendDevelopment(
    portal: PortalId,
    path: string,
    content: DevelopmentListingContent,
    existing: readonly ExistingVariation[],
  ): Promise<Result<void, PortalSyncError>> {
    const place = await this.#place(content.source);
    if (place.isErr()) return err(place.error);
    const { title, pictures, attributes, variations } = developmentItem(content, existing);
    const updated = await this.#call(portal, 'PUT', path, {
      title,
      pictures,
      attributes,
      variations,
      ...place.value,
    });
    if (updated.isErr()) return err(updated.error);
    const description = await this.#call(portal, 'PUT', `${path}/description`, {
      plain_text: content.source.description,
    });
    return description.isErr() ? err(description.error) : ok(undefined);
  }

  /**
   * El aviso que ya se creó para esta publicación, si hay (ADR 0024): cuando ML crea el ítem pero
   * la respuesta no llega (se vence el pedido), el reintento lo encuentra por el
   * `seller_custom_field` y no publica otro.
   */
  async #createdBefore(
    portal: PortalId,
    userId: string,
    listingId: string,
  ): Promise<
    Result<
      { readonly externalId: string; readonly permalink: string | undefined } | undefined,
      PortalSyncError
    >
  > {
    const query = new URLSearchParams({ seller_sku: listingId });
    const path = `/users/${encodeURIComponent(userId)}/items/search?${query.toString()}`;
    const found = await this.#call(portal, 'GET', path);
    if (found.isErr()) return err(found.error);
    const search = SearchSchema.safeParse(found.value);
    if (!search.success) return this.#unexpected(portal, '/items/search');
    const externalId = search.data.results[0];
    if (externalId === undefined) return ok(undefined);
    this.options.logger.warn(
      { portal, externalId },
      'MercadoLibre listing was already created: taking it instead of posting another',
    );
    return ok({ externalId, permalink: undefined });
  }

  /** El `user_id` de la cuenta en ML. */
  async #userId(portal: PortalId): Promise<Result<string, PortalSyncError>> {
    const me = await this.#call(portal, 'GET', '/users/me');
    if (me.isErr()) return err(me.error);
    const user = MeSchema.safeParse(me.value);
    return user.success ? ok(user.data.id) : this.#unexpected(portal, '/users/me');
  }

  /** El tipo de aviso de un paquete de emprendimientos activo y con cupo. */
  async #developmentListingType(
    portal: PortalId,
    userId: string,
  ): Promise<Result<string, PortalSyncError>> {
    const query = new URLSearchParams({ package_content: 'developments', status: 'active' });
    const packsPath = `/users/${encodeURIComponent(userId)}/classifieds_promotion_packs?${query.toString()}`;
    const packs = await this.#call(portal, 'GET', packsPath);
    if (packs.isErr()) return err(packs.error);
    const parsed = DevelopmentPacksSchema.safeParse(packs.value);
    if (!parsed.success) return this.#unexpected(portal, '/classifieds_promotion_packs');
    const detail = parsed.data
      .flatMap((pack) => pack.listing_details ?? [])
      .find((d) => (d.remaining_listings ?? 0) > 0);
    return detail === undefined
      ? err({ type: 'PortalRejected', reason: NO_DEVELOPMENT_PACKAGE })
      : ok(detail.listing_type_id);
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
      {
        portal,
        method,
        path,
        status: response.status,
        error: detail?.error,
        message: detail?.message,
        causes,
      },
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

/** Por qué MercadoLibre no deja activar el aviso ahora; `undefined` si se puede. */
function blockedReason(item: z.infer<typeof ItemSchema>): string | undefined {
  if (item.status === 'paused') {
    return item.tags?.includes('moderation_penalty') === true ? MODERATION_PENALTY : undefined;
  }
  return NOT_ACTIVATABLE[item.status];
}

/**
 * Lo que significa un rechazo que MercadoLibre no explica (el 402 de una cuenta sin paquete llega
 * sin cuerpo).
 */
const STATUS_REASONS: Readonly<Record<number, string>> = {
  402: 'la cuenta no tiene un paquete de publicaciones de inmuebles con cupo para este tipo de aviso',
  403: 'la cuenta no tiene permiso para publicar inmuebles',
};

/**
 * El motivo para la ficha: los mensajes de cada causa, el general de MercadoLibre o, si no explica
 * nada, lo que significa el status. Siempre con el status, para buscarlo en su documentación.
 */
function rejectionReason(detail: z.infer<typeof ErrorSchema> | undefined, status: number): string {
  const messages = (detail?.cause ?? [])
    .map((c) => c.message)
    .filter((message): message is string => message !== undefined && message !== '');
  if (messages.length > 0) return `MercadoLibre rechazó el aviso: ${messages.join(' ')}`;
  const text =
    detail?.message !== undefined && detail.message !== ''
      ? detail.message
      : (STATUS_REASONS[status] ?? detail?.error);
  return text === undefined || text === ''
    ? `MercadoLibre rechazó el aviso (HTTP ${String(status)}).`
    : `MercadoLibre rechazó el aviso: ${text} (HTTP ${String(status)}).`;
}
