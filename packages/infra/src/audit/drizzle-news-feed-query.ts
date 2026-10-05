import {
  NEWS_ACTION_KINDS,
  NEWS_ACTIONS,
  NEWS_ENTITY_TYPES,
  NEWS_KINDS,
  OPERATIONS_FIELD,
  PROPERTY_EDIT_ACTION,
  type NewsCardRecord,
  type NewsClientHeader,
  type NewsFeedCriteria,
  type NewsFeedQuery,
  type NewsPropertyHeader,
} from '@norde/core/audit';
import {
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
} from '@norde/core/properties/contracts';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, inArray, lte, max, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  auditLog,
  clients,
  clientTagAssignments,
  clientTags,
  mediaItems,
  properties,
  propertyOperations,
} from '../db/schema';
import { parseHistoryChanges } from './history-changes';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

const EntityType = z.enum(NEWS_ENTITY_TYPES);
const Kind = z.enum(NEWS_KINDS);
const CoverRow = z.object({ mediaId: z.string(), hasThumbnail: z.boolean() }).nullable();
const PropertyRow = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUS_VALUES),
});
const OperationRow = z.object({ operation: z.enum(OPERATIONS), currency: z.enum(CURRENCIES) });

/** Etiquetas que muestra la tarjeta de un contacto. */
const MAX_CARD_TAGS = 8;

/**
 * Una clave fija del diff como literal: con un parámetro, `jsonb -> $1` es ambiguo para Postgres
 * (clave de texto o posición). Solo recibe constantes del código, nunca input.
 */
function jsonKey(key: string): SQL {
  return sql.raw(`'${key.replaceAll("'", "''")}'`);
}

/** Los valores de una lista de operaciones del diff (`before` o `after`), sin repetidos y ordenados. */
function operationsSet(side: 'before' | 'after', value: SQL): SQL {
  return sql`array(select distinct ${value} from jsonb_array_elements(${auditLog.changes} -> ${jsonKey(OPERATIONS_FIELD)} -> ${jsonKey(side)}) as e(v) order by 1)`;
}

/**
 * El tipo de noticia de cada entrada, en SQL: la misma regla que `newsKindOf` del dominio (lo
 * verifica el test de integración con los mismos casos). `null` si la entrada no es noticia.
 */
function kindExpression(): SQL {
  const byAction = Object.entries(NEWS_ACTION_KINDS).map(
    ([action, kind]) => sql`when ${action} then ${kind}`,
  );
  const operation = sql`v ->> 'operation'`;
  const price = sql`concat_ws('|', v ->> 'operation', v ->> 'currency', v ->> 'priceCents')`;
  const operations = sql`${auditLog.changes} -> ${jsonKey(OPERATIONS_FIELD)}`;
  return sql`case
    when ${auditLog.action} = ${PROPERTY_EDIT_ACTION} then
      case
        when jsonb_typeof(${operations} -> 'before') is distinct from 'array'
          or jsonb_typeof(${operations} -> 'after') is distinct from 'array' then null
        when ${operationsSet('before', operation)} is distinct from ${operationsSet('after', operation)}
          then 'property.operation_changed'
        when ${operationsSet('before', price)} is distinct from ${operationsSet('after', price)}
          then 'property.price_changed'
      end
    else case ${auditLog.action} ${sql.join(byAction, sql` `)} end
  end`;
}

/** Solo las entidades de esa sucursal, como están hoy (sin foreign key entre módulos). */
function inBranch(branchId: string): SQL {
  return sql`case ${auditLog.entityType}
    when 'property' then ${auditLog.entityId} in (select p.id::text from ${properties} p where p.branch_id = ${branchId})
    when 'client' then ${auditLog.entityId} in (select c.id::text from ${clients} c where c.branch_id = ${branchId})
    else false
  end`;
}

/**
 * Noticias sobre `audit_log`, con el índice `(entity_type, occurred_at desc)`: clasifica cada
 * entrada, agrupa por entidad y día en Buenos Aires y pagina las tarjetas. Las cabeceras salen de
 * propiedades y contactos tal como están hoy, también los que están en la papelera.
 */
export class DrizzleNewsFeedQuery implements NewsFeedQuery {
  constructor(private readonly db: DbExecutor) {}

  /** Las novedades (entradas que son noticia de esos tipos), acotadas por `where`. */
  private news(criteria: NewsFeedCriteria, where?: SQL) {
    const kind = sql<string | null>`(${kindExpression()})`;
    return this.db.$with('news').as(
      this.db
        .select({
          id: auditLog.id,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          occurredAt: auditLog.occurredAt,
          actorId: auditLog.actorId,
          action: auditLog.action,
          changes: auditLog.changes,
          kind: kind.as('kind'),
          day: sql<string>`to_char(${auditLog.occurredAt} at time zone ${TIME_ZONE}, 'YYYY-MM-DD')`.as(
            'day',
          ),
        })
        .from(auditLog)
        .where(
          and(
            inArray(auditLog.entityType, [...NEWS_ENTITY_TYPES]),
            inArray(auditLog.action, [...NEWS_ACTIONS]),
            inArray(kind, [...criteria.kinds]),
            criteria.branchId === undefined ? undefined : inBranch(criteria.branchId),
            where,
          ),
        ),
    );
  }

  async list(criteria: NewsFeedCriteria): Promise<PageSlice<NewsCardRecord>> {
    if (criteria.kinds.length === 0) return { items: [], total: 0 };
    const news = this.news(criteria);
    const lastAt = max(news.occurredAt);
    // Los builders de Drizzle cambian al encadenar: la página y el conteo arman cada uno el suyo.
    const cards = () =>
      this.db
        .with(news)
        .select({
          entityType: news.entityType,
          entityId: news.entityId,
          day: news.day,
          lastAt,
          entryCount: count(),
        })
        .from(news)
        .groupBy(news.entityType, news.entityId, news.day);
    const [page, totals] = await Promise.all([
      cards()
        .orderBy(desc(lastAt), asc(news.entityType), asc(news.entityId))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(cards().as('cards')),
    ]);
    if (page.length === 0) return { items: [], total: totals[0]?.total ?? 0 };

    const [entries, headers] = await Promise.all([
      this.entriesOf(criteria, page),
      this.headersOf(page),
    ]);
    return {
      total: totals[0]?.total ?? 0,
      items: page.map((card) => {
        const key = `${card.entityType}|${card.entityId}|${card.day}`;
        return {
          entityType: EntityType.parse(card.entityType),
          entityId: card.entityId,
          day: card.day,
          header: headers.get(card.entityId),
          entries: entries.get(key) ?? [],
          entryCount: card.entryCount,
        };
      }),
    };
  }

  /** Las entradas más nuevas de cada tarjeta de la página. */
  private async entriesOf(
    criteria: NewsFeedCriteria,
    cards: readonly { entityType: string; entityId: string; day: string }[],
  ) {
    const news = this.news(
      criteria,
      inArray(auditLog.entityId, [...new Set(cards.map((card) => card.entityId))]),
    );
    const ranked = this.db
      .with(news)
      .select({
        id: news.id,
        entityType: news.entityType,
        entityId: news.entityId,
        day: news.day,
        occurredAt: news.occurredAt,
        actorId: news.actorId,
        action: news.action,
        changes: news.changes,
        kind: news.kind,
        rank: sql<number>`row_number() over (partition by ${news.entityType}, ${news.entityId}, ${news.day} order by ${news.occurredAt} desc, ${news.id} desc)`.as(
          'rank',
        ),
      })
      .from(news)
      .where(
        or(
          ...cards.map((card) =>
            and(
              eq(news.entityType, card.entityType),
              eq(news.entityId, card.entityId),
              eq(news.day, card.day),
            ),
          ),
        ),
      )
      .as('ranked');
    const rows = await this.db
      .select()
      .from(ranked)
      .where(lte(ranked.rank, criteria.entriesPerCard))
      .orderBy(desc(ranked.occurredAt), desc(ranked.id))
      .limit(cards.length * criteria.entriesPerCard);
    const byCard = new Map<string, NewsCardRecord['entries'][number][]>();
    for (const row of rows) {
      const key = `${row.entityType}|${row.entityId}|${row.day}`;
      const list = byCard.get(key) ?? [];
      list.push({
        id: row.id,
        occurredAt: row.occurredAt,
        actorId: row.actorId,
        action: row.action,
        kind: Kind.parse(row.kind),
        changes: parseHistoryChanges(row.changes),
      });
      byCard.set(key, list);
    }
    return byCard;
  }

  /** La cabecera de cada entidad de la página, por ID. */
  private async headersOf(
    cards: readonly { entityType: string; entityId: string }[],
  ): Promise<ReadonlyMap<string, NewsPropertyHeader | NewsClientHeader>> {
    const idsOf = (type: string) => [
      ...new Set(cards.filter((card) => card.entityType === type).map((card) => card.entityId)),
    ];
    const [propertyHeaders, clientHeaders] = await Promise.all([
      this.propertyHeaders(idsOf('property')),
      this.clientHeaders(idsOf('client')),
    ]);
    return new Map<string, NewsPropertyHeader | NewsClientHeader>([
      ...propertyHeaders,
      ...clientHeaders,
    ]);
  }

  private async propertyHeaders(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, NewsPropertyHeader>();
    const [rows, operations] = await Promise.all([
      this.db
        .select({
          id: properties.id,
          code: properties.code,
          title: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
          propertyType: properties.propertyType,
          neighborhood: properties.neighborhood,
          status: properties.status,
          // Portada o primera foto (índice `media_items_property_position_idx`). Dentro de la
          // subconsulta drizzle no califica `id`: se nombra la tabla exterior a mano.
          cover: sql<unknown>`(
            select json_build_object('mediaId', m.id, 'hasThumbnail', m.variants ? 'thumbnail')
            from ${mediaItems} m
            where m.property_id = ${sql.raw('"properties"."id"')} and m.kind = 'photo'
            order by m.is_cover desc, m.position asc
            limit 1
          )`,
          deletedAt: properties.deletedAt,
        })
        .from(properties)
        .where(inArray(properties.id, [...ids]))
        .limit(ids.length),
      this.db
        .select({
          propertyId: propertyOperations.propertyId,
          operation: propertyOperations.operation,
          currency: propertyOperations.currency,
          priceCents: propertyOperations.priceCents,
          priceOnRequest: propertyOperations.priceOnRequest,
        })
        .from(propertyOperations)
        .where(inArray(propertyOperations.propertyId, [...ids]))
        .orderBy(asc(propertyOperations.propertyId), asc(propertyOperations.operation))
        // Como mucho una fila por operación de cada propiedad de la página.
        .limit(ids.length * OPERATIONS.length),
    ]);
    const byProperty = new Map<string, NewsPropertyHeader['operations'][number][]>();
    for (const row of operations) {
      const list = byProperty.get(row.propertyId) ?? [];
      list.push({
        ...OperationRow.parse(row),
        priceCents: row.priceOnRequest ? null : row.priceCents,
      });
      byProperty.set(row.propertyId, list);
    }
    return new Map<string, NewsPropertyHeader>(
      rows.map((row) => [
        row.id,
        {
          entityType: 'property',
          code: row.code,
          title: row.title,
          ...PropertyRow.parse(row),
          neighborhood: row.neighborhood,
          cover: CoverRow.parse(row.cover) ?? undefined,
          operations: byProperty.get(row.id) ?? [],
          deleted: row.deletedAt !== null,
        },
      ]),
    );
  }

  private async clientHeaders(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, NewsClientHeader>();
    const ranked = this.db
      .select({
        clientId: clientTagAssignments.clientId,
        id: clientTags.id,
        name: clientTags.name,
        color: clientTags.color,
        rank: sql<number>`row_number() over (partition by ${clientTagAssignments.clientId} order by ${clientTags.name}, ${clientTags.id})`.as(
          'rank',
        ),
      })
      .from(clientTagAssignments)
      .innerJoin(clientTags, eq(clientTags.id, clientTagAssignments.tagId))
      .where(inArray(clientTagAssignments.clientId, [...ids]))
      .as('ranked_tags');
    const [rows, tags] = await Promise.all([
      this.db
        .select({ id: clients.id, name: clients.name, deletedAt: clients.deletedAt })
        .from(clients)
        .where(inArray(clients.id, [...ids]))
        .limit(ids.length),
      this.db
        .select()
        .from(ranked)
        .where(lte(ranked.rank, MAX_CARD_TAGS))
        .orderBy(asc(ranked.clientId), asc(ranked.rank))
        .limit(ids.length * MAX_CARD_TAGS),
    ]);
    const byClient = new Map<string, NewsClientHeader['tags'][number][]>();
    for (const tag of tags) {
      const list = byClient.get(tag.clientId) ?? [];
      list.push({ id: tag.id, name: tag.name, color: tag.color ?? undefined });
      byClient.set(tag.clientId, list);
    }
    return new Map<string, NewsClientHeader>(
      rows.map((row) => [
        row.id,
        {
          entityType: 'client',
          name: row.name ?? undefined,
          tags: byClient.get(row.id) ?? [],
          deleted: row.deletedAt !== null,
        },
      ]),
    );
  }
}
