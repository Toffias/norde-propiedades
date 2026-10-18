import type {
  PortalCredentialsMissingError,
  PortalId,
  PortalListingStateReader,
  PortalPackage,
  PortalPackageContent,
  PortalPackageReader,
  PortalUnavailableError,
  RemoteListingState,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { MercadoLibreAccessTokens } from './mercadolibre-portal-connector';

export interface MercadoLibreAccountReaderOptions {
  readonly tokens: MercadoLibreAccessTokens;
  readonly logger: InfraLogger;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

type ReadError = PortalUnavailableError | PortalCredentialsMissingError;

/** Lo que acepta el multiget de items (`/items?ids=`) por pedido. */
const MULTIGET_SIZE = 20;
const TIMEOUT_MS = 20_000;

/** Cada respuesta del multiget: el código y el ítem (o el error) en `body`. */
const MultigetSchema = z.array(z.object({ code: z.number(), body: z.unknown() }));
const ItemSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    sub_status: z.array(z.string()).nullish(),
    tags: z.array(z.string()).nullish(),
  })
  .loose();
type Item = z.infer<typeof ItemSchema>;

const ModerationSchema = z.array(
  z
    .object({
      wordings: z.array(z.object({ type: z.string(), value: z.string() }).loose()).nullish(),
    })
    .loose(),
);

const PACKAGE_CONTENTS: readonly PortalPackageContent[] = [
  'publications',
  'upgrades',
  'developments',
];

const PackagesSchema = z.array(
  z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      description: z.string().nullish(),
      package_content: z.string(),
      status: z.string(),
      date_expires: z.string().nullish(),
      listing_details: z
        .array(
          z
            .object({
              listing_type_id: z.string(),
              available_listings: z.number().nullish(),
              used_listings: z.number().nullish(),
              remaining_listings: z.number().nullish(),
            })
            .loose(),
        )
        .nullish(),
    })
    .loose(),
);

const NOT_FOUND = 'El aviso ya no existe en MercadoLibre.';
const CLOSED_REASONS: Readonly<Record<string, string>> = {
  expired: 'MercadoLibre venció el aviso: terminó su vigencia.',
  deleted: 'El aviso se borró en MercadoLibre.',
  suspended: 'MercadoLibre dio de baja el aviso por moderación.',
  banned: 'MercadoLibre dio de baja el aviso por moderación.',
  forbidden: 'MercadoLibre dio de baja el aviso por moderación.',
};
const CLOSED = 'El aviso se cerró en MercadoLibre.';
const PAUSED_IN_PORTAL =
  'Se pausó desde MercadoLibre. Si tiene que seguir publicado, sincronizalo desde la ficha.';
/** Los estados en que MercadoLibre modera el aviso: el motivo se lee de su última moderación. */
const MODERATED = {
  paused: 'MercadoLibre pausó el aviso',
  under_review: 'MercadoLibre está revisando el aviso',
  inactive: 'MercadoLibre inactivó el aviso',
} as const;
const PAYMENT_REQUIRED = 'MercadoLibre espera un pago para mostrar el aviso.';
/** Mientras MercadoLibre descarga las fotos, el aviso no está activo todavía: no es un cambio. */
const PROCESSING_PICTURES = 'picture_download_pending';

/**
 * Lecturas de una cuenta de MercadoLibre que no son la publicación en sí: cómo están los avisos
 * (para la conciliación diaria) y el cupo de los paquetes de inmuebles. Por HTTP y sin SDK, con el
 * token de la cuenta. Nunca loguea tokens.
 */
export class MercadoLibreAccountReader implements PortalListingStateReader, PortalPackageReader {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(private readonly options: MercadoLibreAccountReaderOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.apiBaseUrl ?? 'https://api.mercadolibre.com';
  }

  async states(
    portal: PortalId,
    externalIds: readonly string[],
  ): Promise<Result<ReadonlyMap<string, RemoteListingState>, ReadError>> {
    const states = new Map<string, RemoteListingState>();
    for (let i = 0; i < externalIds.length; i += MULTIGET_SIZE) {
      const ids = externalIds.slice(i, i + MULTIGET_SIZE);
      const query = new URLSearchParams({
        ids: ids.join(','),
        attributes: 'id,status,sub_status,tags',
      });
      const read = await this.#get(portal, `/items?${query.toString()}`);
      if (read.isErr()) return err(read.error);
      const parsed = MultigetSchema.safeParse(read.value);
      if (!parsed.success) return this.#unexpected(portal, '/items');

      for (const [index, entry] of parsed.data.entries()) {
        // El multiget responde en el orden de los IDs pedidos.
        const id = ids[index];
        if (id === undefined) continue;
        if (entry.code === 404) {
          states.set(id, { state: 'closed', reason: NOT_FOUND });
          continue;
        }
        const body = ItemSchema.safeParse(entry.body);
        if (entry.code !== 200 || !body.success) {
          this.options.logger.warn(
            { portal, externalId: id, code: entry.code },
            'MercadoLibre did not report a listing',
          );
          continue;
        }
        const state = await this.#stateOf(portal, body.data);
        if (state.isErr()) return err(state.error);
        if (state.value !== undefined) states.set(id, state.value);
      }
    }
    return ok(states);
  }

  async packages(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
  }): Promise<Result<readonly PortalPackage[], ReadError>> {
    const { portal, externalAccountId } = input;
    const path = `/users/${encodeURIComponent(externalAccountId)}/classifieds_promotion_packs`;
    const query = new URLSearchParams({ package_content: 'ALL', status: 'active' });
    const read = await this.#get(portal, `${path}?${query.toString()}`);
    if (read.isErr()) return err(read.error);
    const parsed = PackagesSchema.safeParse(read.value);
    if (!parsed.success) return this.#unexpected(portal, path);

    return ok(
      parsed.data.flatMap((pack): PortalPackage[] => {
        const content = PACKAGE_CONTENTS.find((c) => c === pack.package_content);
        if (pack.status !== 'active' || content === undefined) return [];
        const quotas = (pack.listing_details ?? []).flatMap((detail) => {
          const total = detail.available_listings;
          const remaining = detail.remaining_listings;
          // Un paquete ilimitado no informa cupo: no hay nada que contar.
          if (
            total === null ||
            total === undefined ||
            remaining === null ||
            remaining === undefined
          )
            return [];
          return [
            {
              tier: detail.listing_type_id,
              total,
              used: detail.used_listings ?? total - remaining,
              remaining,
            },
          ];
        });
        const expires = pack.date_expires ? new Date(pack.date_expires) : undefined;
        return [
          {
            id: pack.id,
            name: pack.description ?? `Paquete ${pack.id}`,
            content,
            expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : undefined,
            quotas,
          },
        ];
      }),
    );
  }

  /** El estado del aviso para Norde; `undefined` si está en un estado transitorio o desconocido. */
  async #stateOf(
    portal: PortalId,
    item: Item,
  ): Promise<Result<RemoteListingState | undefined, ReadError>> {
    const subStatus = item.sub_status ?? [];
    const tags = item.tags ?? [];
    switch (item.status) {
      case 'active':
        return ok({ state: 'active', reason: undefined });
      case 'closed': {
        const known = subStatus.map((s) => CLOSED_REASONS[s]).find((r) => r !== undefined);
        return ok({ state: 'closed', reason: known ?? CLOSED });
      }
      case 'not_yet_active':
        return ok(undefined);
      case 'payment_required':
        return ok({ state: 'paused', reason: PAYMENT_REQUIRED });
      case 'paused':
        if (subStatus.includes(PROCESSING_PICTURES)) return ok(undefined);
        if (!tags.includes('moderation_penalty')) {
          return ok({ state: 'paused', reason: PAUSED_IN_PORTAL });
        }
        return this.#moderated(portal, item.id, MODERATED.paused);
      case 'under_review':
        return this.#moderated(portal, item.id, MODERATED.under_review);
      case 'inactive':
        return this.#moderated(portal, item.id, MODERATED.inactive);
      default:
        this.options.logger.warn(
          { portal, externalId: item.id, status: item.status },
          'Unknown MercadoLibre listing status',
        );
        return ok(undefined);
    }
  }

  /** Pausado por moderación, con el motivo que da MercadoLibre si lo informa. */
  async #moderated(
    portal: PortalId,
    externalId: string,
    what: string,
  ): Promise<Result<RemoteListingState, ReadError>> {
    const path = `/moderations/last_moderation/${encodeURIComponent(externalId)}-ITM`;
    const read = await this.#get(portal, path);
    if (read.isErr() && read.error.type === 'PortalCredentialsMissing') return err(read.error);
    const reason = read.isOk()
      ? ModerationSchema.safeParse(read.value)
          .data?.flatMap((m) => m.wordings ?? [])
          .find((w) => w.type === 'REASON')?.value
      : undefined;
    if (reason === undefined) {
      this.options.logger.warn(
        { portal, externalId },
        'MercadoLibre did not report the moderation reason',
      );
    }
    return ok({
      state: 'paused',
      reason:
        reason === undefined
          ? `${what} por moderación. Revisalo en la cuenta de MercadoLibre.`
          : `${what}: ${reason}`,
    });
  }

  async #get(portal: PortalId, path: string): Promise<Result<unknown, ReadError>> {
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
    logger.warn(
      { portal, path: pathOnly(path), status: response.status },
      'MercadoLibre rejected a read',
    );
    return response.status === 401
      ? err({ type: 'PortalCredentialsMissing' })
      : err({ type: 'PortalUnavailable' });
  }

  #unexpected<T>(portal: PortalId, path: string): Result<T, ReadError> {
    this.options.logger.error({ portal, path: pathOnly(path) }, 'Unexpected MercadoLibre response');
    return err({ type: 'PortalUnavailable' });
  }
}

/** La ruta sin la query: los IDs de los avisos no aportan al log. */
function pathOnly(path: string): string {
  return path.split('?')[0] ?? path;
}
