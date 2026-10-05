import { CONTACT_CHANNEL_VALUES } from '@norde/core/clients/contracts';
import {
  CONSTRUCTION_STATUS_VALUES,
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
} from '@norde/core/properties/contracts';
import type {
  AvailableDevelopmentRecord,
  AvailablePropertyRecord,
  ChannelCount,
  CountByPropertyStatus,
  CountByStage,
  HomeDashboardQuery,
  HomeListRequest,
  HomeScope,
  HomeVisibility,
  PendingOpportunityRecord,
  UnassignedInquiryRow,
  UpcomingSigningRecord,
} from '@norde/core/reporting';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  clients,
  developments,
  inquiries,
  mediaItems,
  opportunities,
  opportunityStages,
  properties,
  propertyOperations,
  reservations,
} from '../db/schema';

const Channel = z.enum(CONTACT_CHANNEL_VALUES);
const PropertyRowEnums = z.object({ propertyType: z.enum(PROPERTY_TYPES) });
const CoverRow = z.object({ mediaId: z.string(), hasThumbnail: z.boolean() }).nullable();
const OperationEnums = z.object({ operation: z.enum(OPERATIONS), currency: z.enum(CURRENCIES) });
const PropertyStatus = z.enum(PROPERTY_STATUS_VALUES);
const ConstructionStatus = z.enum(CONSTRUCTION_STATUS_VALUES);

/** Estados editables de oportunidades: una lista corta de configuración. */
const MAX_STAGES = 50;

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

/** Lo que ve quien mira, por el agente y la sucursal del registro. */
function visible(visibility: HomeVisibility, agent: AnyColumn, branch: AnyColumn): SQL {
  switch (visibility.kind) {
    case 'all':
      return sql`true`;
    case 'own':
      return eq(agent, visibility.ownerId);
    case 'branch':
      return or(eq(agent, visibility.ownerId), eq(branch, visibility.branchId)) ?? sql`false`;
  }
}

/** El alcance más los filtros de agente y sucursal, sobre las columnas de esa tabla. */
function owned(scope: HomeScope, agent: AnyColumn, branch: AnyColumn): SQL {
  return (
    and(
      visible(scope.visibility, agent, branch),
      scope.agentId === undefined ? undefined : eq(agent, scope.agentId),
      scope.branchId === undefined ? undefined : eq(branch, scope.branchId),
    ) ?? sql`true`
  );
}

/** Antes del backfill de la `0016` podía faltar; desde entonces siempre está. */
const waitingSince = sql<Date>`coalesce(${opportunities.statusChangedAt}, ${opportunities.createdAt})`;

/**
 * Lecturas de Inicio (#15). Es un modelo de lectura de reporting: cruza tablas de clients y
 * properties. Cada lectura tiene su límite y usa los índices por estado, agente y sucursal.
 */
export class DrizzleHomeDashboardQuery implements HomeDashboardQuery {
  constructor(private readonly db: DbExecutor) {}

  async unassignedInquiries(
    criteria: { readonly branchId: string | undefined },
    limit: number,
  ): Promise<PageSlice<UnassignedInquiryRow>> {
    const where = and(
      eq(inquiries.status, 'pending'),
      isNull(inquiries.deletedAt),
      criteria.branchId === undefined ? undefined : eq(inquiries.branchId, criteria.branchId),
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: inquiries.id,
          channel: inquiries.channel,
          receivedAt: inquiries.receivedAt,
          senderName: inquiries.senderName,
          propertyId: inquiries.propertyId,
          propertyCode: properties.code,
          developmentId: inquiries.developmentId,
          developmentName: developments.name,
        })
        .from(inquiries)
        .leftJoin(properties, eq(properties.id, inquiries.propertyId))
        .leftJoin(developments, eq(developments.id, inquiries.developmentId))
        .where(where)
        .orderBy(asc(inquiries.receivedAt), asc(inquiries.id))
        .limit(limit),
      this.db.select({ total: count() }).from(inquiries).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        channel: Channel.parse(row.channel),
        receivedAt: row.receivedAt,
        senderName: row.senderName ?? undefined,
        propertyId: row.propertyId ?? undefined,
        propertyCode: row.propertyCode ?? undefined,
        developmentId: row.developmentId ?? undefined,
        developmentName: row.developmentName ?? undefined,
      })),
    };
  }

  async opportunitiesInCategories(
    scope: HomeScope,
    categories: readonly string[],
    limit: number,
  ): Promise<PageSlice<PendingOpportunityRecord>> {
    const where = this.opportunitiesIn(scope, categories);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: opportunities.id,
          clientId: opportunities.clientId,
          clientName: clients.name,
          status: opportunities.status,
          stageName: opportunityStages.name,
          stageColor: opportunityStages.color,
          originChannel: opportunities.originChannel,
          agentId: opportunities.agentId,
          waitingSince,
        })
        .from(opportunities)
        .innerJoin(clients, eq(clients.id, opportunities.clientId))
        .leftJoin(opportunityStages, eq(opportunityStages.id, opportunities.stageId))
        .where(where)
        .orderBy(asc(waitingSince), asc(opportunities.id))
        .limit(limit),
      this.db
        .select({ total: count() })
        .from(opportunities)
        .innerJoin(clients, eq(clients.id, opportunities.clientId))
        .where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        clientName: row.clientName ?? undefined,
        stageName: row.stageName ?? row.status,
        stageColor: row.stageColor ?? '',
        originChannel: Channel.parse(row.originChannel),
        agentId: row.agentId ?? undefined,
        waitingSince: new Date(row.waitingSince),
      })),
    };
  }

  async activeReservationsSigningUntil(
    scope: HomeScope,
    until: string,
    limit: number,
  ): Promise<PageSlice<UpcomingSigningRecord>> {
    const where = and(
      eq(reservations.status, 'active'),
      isNotNull(reservations.estimatedSigningDate),
      lte(reservations.estimatedSigningDate, until),
      owned(scope, reservations.agentUserId, reservations.branchId),
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: reservations.id,
          propertyId: reservations.propertyId,
          propertyCode: properties.code,
          propertyTitle: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
          clientId: reservations.clientId,
          clientName: clients.name,
          agentId: reservations.agentUserId,
          estimatedSigningDate: reservations.estimatedSigningDate,
        })
        .from(reservations)
        .innerJoin(properties, eq(properties.id, reservations.propertyId))
        .leftJoin(clients, eq(clients.id, reservations.clientId))
        .where(where)
        .orderBy(asc(reservations.estimatedSigningDate), asc(reservations.id))
        .limit(limit),
      this.db
        .select({ total: count() })
        .from(reservations)
        .innerJoin(properties, eq(properties.id, reservations.propertyId))
        .where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        propertyId: row.propertyId,
        propertyCode: row.propertyCode,
        propertyTitle: row.propertyTitle,
        clientId: row.clientId,
        clientName: row.clientName ?? undefined,
        agentId: row.agentId ?? undefined,
        // El `where` exige la fecha.
        estimatedSigningDate: row.estimatedSigningDate ?? until,
      })),
    };
  }

  async clientsWithOpportunitiesIn(
    scope: HomeScope,
    categories: readonly string[],
  ): Promise<number> {
    const [row] = await this.db
      .select({ total: countDistinct(opportunities.clientId) })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .where(this.opportunitiesIn(scope, categories));
    return row?.total ?? 0;
  }

  async opportunitiesByChannel(
    scope: HomeScope,
    categories: readonly string[],
  ): Promise<readonly ChannelCount[]> {
    const total = count();
    const rows = await this.db
      .select({ channel: opportunities.originChannel, count: total })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .where(this.opportunitiesIn(scope, categories))
      .groupBy(opportunities.originChannel)
      .orderBy(desc(total), asc(opportunities.originChannel))
      .limit(CONTACT_CHANNEL_VALUES.length);
    return rows.map((row) => ({ channel: Channel.parse(row.channel), count: row.count }));
  }

  async opportunitiesByStage(
    scope: HomeScope,
    categories: readonly string[],
  ): Promise<readonly CountByStage[]> {
    const [stages, counts] = await Promise.all([
      this.db
        .select({
          stageId: opportunityStages.id,
          name: opportunityStages.name,
          color: opportunityStages.color,
        })
        .from(opportunityStages)
        .where(
          and(
            eq(opportunityStages.isActive, true),
            inArray(opportunityStages.category, [...categories]),
          ),
        )
        .orderBy(asc(opportunityStages.position), asc(opportunityStages.id))
        .limit(MAX_STAGES),
      this.db
        .select({ stageId: opportunities.stageId, count: count() })
        .from(opportunities)
        .innerJoin(clients, eq(clients.id, opportunities.clientId))
        .where(and(isNotNull(opportunities.stageId), this.opportunitiesIn(scope, categories)))
        .groupBy(opportunities.stageId)
        .limit(MAX_STAGES),
    ]);
    const byStage = new Map(counts.map((row) => [row.stageId, row.count]));
    return stages.map((stage) => ({ ...stage, count: byStage.get(stage.stageId) ?? 0 }));
  }

  async propertiesByStatus(scope: HomeScope): Promise<readonly CountByPropertyStatus[]> {
    const total = count();
    const statusOrder = sql`array_position(array[${sql.join(
      PROPERTY_STATUS_VALUES.map((status) => sql`${status}`),
      sql`, `,
    )}]::text[], ${properties.status})`;
    const rows = await this.db
      .select({ status: properties.status, count: total })
      .from(properties)
      .where(
        and(
          isNull(properties.deletedAt),
          owned(scope, properties.producerUserId, properties.branchId),
        ),
      )
      .groupBy(properties.status)
      .orderBy(statusOrder)
      .limit(PROPERTY_STATUS_VALUES.length);
    return rows.map((row) => ({ status: PropertyStatus.parse(row.status), count: row.count }));
  }

  async availableDevelopmentsCount(scope: HomeScope): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(developments)
      .where(this.availableDevelopmentsWhere(scope));
    return row?.total ?? 0;
  }

  async availableProperties(
    scope: HomeScope,
    request: HomeListRequest,
  ): Promise<PageSlice<AvailablePropertyRecord>> {
    const where = and(
      eq(properties.status, 'available'),
      isNull(properties.deletedAt),
      owned(scope, properties.producerUserId, properties.branchId),
    );
    const column = request.sort.field === 'code' ? properties.code : properties.updatedAt;
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: properties.id,
          code: properties.code,
          propertyType: properties.propertyType,
          title: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
          neighborhood: properties.neighborhood,
          // Portada o primera foto (índice `media_items_property_position_idx`). La columna va
          // calificada: dentro de la subconsulta, `id` apuntaría a la foto.
          cover: sql<unknown>`(
            select json_build_object('mediaId', m.id, 'hasThumbnail', m.variants ? 'thumbnail')
            from ${mediaItems} m
            where m.property_id = ${sql.raw('"properties"."id"')} and m.kind = 'photo'
            order by m.is_cover desc, m.position asc
            limit 1
          )`,
          agentId: properties.producerUserId,
          updatedAt: properties.updatedAt,
        })
        .from(properties)
        .where(where)
        .orderBy(by(request.sort.direction, column), by(request.sort.direction, properties.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(properties).where(where),
    ]);
    const operations = await this.operationsOf(rows.map((row) => row.id));
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        ...PropertyRowEnums.parse(row),
        title: row.title,
        neighborhood: row.neighborhood,
        cover: CoverRow.parse(row.cover) ?? undefined,
        operations: operations.get(row.id) ?? [],
        agentId: row.agentId ?? undefined,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async availableDevelopments(
    scope: HomeScope,
    request: HomeListRequest,
  ): Promise<PageSlice<AvailableDevelopmentRecord>> {
    const where = this.availableDevelopmentsWhere(scope);
    const column = request.sort.field === 'code' ? developments.code : developments.updatedAt;
    // Usa `properties_development_idx`: solo las unidades de los emprendimientos de la página. La
    // columna va calificada: con una sola tabla en el `from`, Drizzle la escribe sin la tabla y
    // dentro de la subconsulta apuntaría a la unidad.
    const availableUnits = sql<number>`(select count(*)::int from ${properties} u where u.development_id = ${developments}.id and u.status = 'available' and u.deleted_at is null)`;
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: developments.id,
          code: developments.code,
          name: developments.name,
          address: developments.publishAddress,
          constructionStatus: developments.constructionStatus,
          availableUnits,
          agentId: developments.producerUserId,
          updatedAt: developments.updatedAt,
        })
        .from(developments)
        .where(where)
        .orderBy(by(request.sort.direction, column), by(request.sort.direction, developments.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(developments).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        address: row.address ?? undefined,
        constructionStatus:
          row.constructionStatus === null
            ? undefined
            : ConstructionStatus.parse(row.constructionStatus),
        availableUnits: row.availableUnits,
        agentId: row.agentId ?? undefined,
        updatedAt: row.updatedAt,
      })),
    };
  }

  /** Oportunidades de clientes no borrados, en esas categorías y dentro del alcance. */
  private opportunitiesIn(scope: HomeScope, categories: readonly string[]): SQL {
    return (
      and(
        isNull(clients.deletedAt),
        inArray(opportunities.status, [...categories]),
        owned(scope, opportunities.agentId, opportunities.branchId),
      ) ?? sql`false`
    );
  }

  private availableDevelopmentsWhere(scope: HomeScope): SQL {
    return (
      and(
        eq(developments.status, 'marketing'),
        isNull(developments.deletedAt),
        owned(scope, developments.producerUserId, developments.branchId),
      ) ?? sql`false`
    );
  }

  private async operationsOf(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, AvailablePropertyRecord['operations'][number][]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
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
      .limit(ids.length * OPERATIONS.length);
    const byProperty = new Map<string, AvailablePropertyRecord['operations'][number][]>();
    for (const row of rows) {
      const list = byProperty.get(row.propertyId) ?? [];
      list.push({
        ...OperationEnums.parse(row),
        priceCents: row.priceOnRequest ? null : row.priceCents,
      });
      byProperty.set(row.propertyId, list);
    }
    return byProperty;
  }
}
