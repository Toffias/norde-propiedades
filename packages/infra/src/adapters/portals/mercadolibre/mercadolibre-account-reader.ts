import type {
  PortalId,
  PortalListingStateReader,
  PortalListingStats,
  PortalListingStatsReader,
  PortalPackage,
  PortalPackageContent,
  PortalPackageReader,
  RemoteListingState,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import {
  MercadoLibreReads,
  type MercadoLibreReadError as ReadError,
  type MercadoLibreReadsOptions,
} from './mercadolibre-reads';

export type MercadoLibreAccountReaderOptions = MercadoLibreReadsOptions;

/** Lo que acepta el multiget de items (`/items?ids=`) por pedido. */
const MULTIGET_SIZE = 20;

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

/** Las visitas de toda la vida de los avisos (`/visits/items?ids=`): `{ "MLA…": 98 }`. */
const TotalVisitsSchema = z.record(z.string(), z.number().int().nonnegative());
/** Las visitas de un aviso en un rango (`/items/visits`): ML lo da como objeto o como lista. */
const RangeVisitsSchema = z.union([
  z.object({ total_visits: z.number().int().nonnegative() }).loose(),
  z.array(z.object({ total_visits: z.number().int().nonnegative() }).loose()).length(1),
]);
/** Los contactos de un aviso en un rango (preguntas, teléfono, WhatsApp): `{ "total": 9 }`. */
const ContactsSchema = z.object({ total: z.number().int().nonnegative() }).loose();
/** Las métricas de contactos de un aviso, en `/items/{id}/contacts/{metric}`. */
const CONTACT_METRICS = ['questions', 'phone_views', 'whatsapp'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD`, como pide ML en `date_from` y `date_to`. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
/** Cuánto vale una lectura de estadísticas, y cuántas se guardan. */
const STATS_CACHE_MS = 5 * 60 * 1000;
const STATS_CACHE_SIZE = 500;
/** Mientras MercadoLibre descarga las fotos, el aviso no está activo todavía: no es un cambio. */
const PROCESSING_PICTURES = 'picture_download_pending';

/**
 * Lecturas de una cuenta de MercadoLibre que no son la publicación en sí: cómo están los avisos
 * (para la conciliación), el cupo de los paquetes de inmuebles y las visitas y contactos de cada
 * aviso. Por HTTP y sin SDK, con el token de la cuenta. Nunca loguea tokens.
 */
export class MercadoLibreAccountReader
  implements PortalListingStateReader, PortalPackageReader, PortalListingStatsReader
{
  readonly #api: MercadoLibreReads;
  /** Las estadísticas leídas hace poco, por portal, aviso y días: cada una son cinco llamadas a ML. */
  readonly #recentStats = new Map<
    string,
    { readonly at: number; readonly stats: PortalListingStats }
  >();

  constructor(private readonly options: MercadoLibreAccountReaderOptions) {
    this.#api = new MercadoLibreReads(options);
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
      const read = await this.#api.get(portal, `/items?${query.toString()}`);
      if (read.isErr()) return err(read.error);
      const parsed = MultigetSchema.safeParse(read.value);
      if (!parsed.success) return this.#api.unexpected(portal, '/items');

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
    const read = await this.#api.get(portal, `${path}?${query.toString()}`);
    if (read.isErr()) return err(read.error);
    const parsed = PackagesSchema.safeParse(read.value);
    if (!parsed.success) return this.#api.unexpected(portal, path);

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

  /**
   * Las visitas y los contactos del aviso (guía "Estadísticas de interacciones en Inmuebles"): las
   * visitas de toda su vida, y las visitas, preguntas, vistas del teléfono y WhatsApp de los `days`
   * días que terminan en `endingAt`. Un aviso sin datos cuenta 0.
   */
  /**
   * Las visitas y contactos del aviso. Se guardan unos minutos: la pestaña Difusión las pide en cada
   * render, y ML las actualiza de a horas.
   */
  async stats(input: {
    readonly portal: PortalId;
    readonly externalId: string;
    readonly endingAt: Date;
    readonly days: number;
  }): Promise<Result<PortalListingStats, ReadError>> {
    const key = `${input.portal}:${input.externalId}:${String(input.days)}`;
    const now = input.endingAt.getTime();
    const cached = this.#recentStats.get(key);
    if (cached !== undefined && now - cached.at < STATS_CACHE_MS) return ok(cached.stats);
    const read = await this.#readStats(input);
    if (read.isOk()) {
      this.#recentStats.delete(key);
      this.#recentStats.set(key, { at: now, stats: read.value });
      // Map guarda el orden de inserción: la primera es la más vieja.
      const oldest = this.#recentStats.keys().next();
      if (this.#recentStats.size > STATS_CACHE_SIZE && oldest.done !== true) {
        this.#recentStats.delete(oldest.value);
      }
    }
    return read;
  }

  async #readStats(input: {
    readonly portal: PortalId;
    readonly externalId: string;
    readonly endingAt: Date;
    readonly days: number;
  }): Promise<Result<PortalListingStats, ReadError>> {
    const { portal, externalId, endingAt, days } = input;
    const id = encodeURIComponent(externalId);
    const range = new URLSearchParams({
      date_from: isoDay(new Date(endingAt.getTime() - days * DAY_MS)),
      date_to: isoDay(endingAt),
    });

    const total = await this.#api.get(portal, `/visits/items?ids=${id}`);
    if (total.isErr()) return err(total.error);
    const totals = TotalVisitsSchema.safeParse(total.value);
    if (!totals.success) return this.#api.unexpected(portal, '/visits/items');

    const visitsQuery = new URLSearchParams(range);
    visitsQuery.set('ids', externalId);
    const visits = await this.#api.get(portal, `/items/visits?${visitsQuery.toString()}`);
    if (visits.isErr()) return err(visits.error);
    const inRange = RangeVisitsSchema.safeParse(visits.value);
    if (!inRange.success) return this.#api.unexpected(portal, '/items/visits');

    const contacts: number[] = [];
    for (const metric of CONTACT_METRICS) {
      const path = `/items/${id}/contacts/${metric}`;
      const read = await this.#api.get(portal, `${path}?${range.toString()}`);
      if (read.isErr()) return err(read.error);
      const parsed = ContactsSchema.safeParse(read.value);
      if (!parsed.success) return this.#api.unexpected(portal, path);
      contacts.push(parsed.data.total);
    }
    const [questions = 0, phoneViews = 0, whatsapp = 0] = contacts;

    return ok({
      totalVisits: totals.data[externalId] ?? 0,
      visits: Array.isArray(inRange.data)
        ? (inRange.data[0]?.total_visits ?? 0)
        : inRange.data.total_visits,
      questions,
      phoneViews,
      whatsapp,
    });
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
    const read = await this.#api.get(portal, path);
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
}
