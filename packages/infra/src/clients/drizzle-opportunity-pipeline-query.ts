import {
  CLIENT_KINDS,
  CLIENT_TYPES,
  OPPORTUNITY_STATUSES,
  type OpportunityBulkCriteria,
  type OpportunityFilterCriteria,
  type OpportunityListCriteria,
  type OpportunityPipelineItem,
  type OpportunityPipelineQuery,
  type OpportunityStageCount,
  type OpportunityStatusValue,
} from '@norde/core/clients';
import type { VisibilityFilter } from '@norde/core/identity';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  clientActivities,
  clientPhones,
  clients,
  clientTagAssignments,
  opportunities,
} from '../db/schema';
import { matchesSearchText } from '../db/text-search';

/** Lo que se muestra de la última nota en la fila. */
const NOTE_PREVIEW_LENGTH = 200;

const RowEnums = z.object({
  clientKind: z.enum(CLIENT_KINDS),
  clientTypes: z.array(z.enum(CLIENT_TYPES)),
  status: z.enum(OPPORTUNITY_STATUSES),
});

/** Antes del backfill de la `0016` podía faltar; desde entonces siempre está. */
const statusChangedAt = sql<Date>`coalesce(${opportunities.statusChangedAt}, ${opportunities.createdAt})`;

const rowColumns = {
  id: opportunities.id,
  clientId: opportunities.clientId,
  clientKind: clients.kind,
  clientName: clients.name,
  clientTypes: clients.clientTypes,
  clientPhone: clients.phoneE164,
  type: opportunities.type,
  intent: opportunities.intent,
  originChannel: opportunities.originChannel,
  status: opportunities.status,
  stageId: opportunities.stageId,
  propertyId: opportunities.propertyId,
  agentId: opportunities.agentId,
  branchId: opportunities.branchId,
  statusChangedAt: opportunities.statusChangedAt,
  partnerName: opportunities.partnerName,
  referredAt: opportunities.referredAt,
  referralResult: opportunities.referralResult,
  createdAt: opportunities.createdAt,
  updatedAt: opportunities.updatedAt,
};

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

/** La visibilidad del actor por el agente y la sucursal de la oportunidad (no los del contacto). */
function visibleOpportunities(visibility: VisibilityFilter): SQL {
  switch (visibility.kind) {
    case 'all':
      return sql`true`;
    case 'own':
      return eq(opportunities.agentId, visibility.ownerId);
    case 'branch':
      return (
        or(
          eq(opportunities.agentId, visibility.ownerId),
          eq(opportunities.branchId, visibility.branchId),
        ) ?? sql`false`
      );
    case 'none':
      return sql`false`;
  }
}

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * El pipeline de oportunidades. Cada sección recorre un índice que empieza por `stage_id`; los
 * contadores agrupan por estado con los mismos filtros (ver `schema/clients.ts`). Las de contactos
 * en la papelera no se listan.
 */
export class DrizzleOpportunityPipelineQuery implements OpportunityPipelineQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: OpportunityListCriteria): Promise<PageSlice<OpportunityPipelineItem>> {
    const where = and(eq(opportunities.stageId, criteria.stageId), ...this.filters(criteria));
    const [rows, total] = await Promise.all([
      this.db
        .select(rowColumns)
        .from(opportunities)
        .innerJoin(clients, eq(clients.id, opportunities.clientId))
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.countWhere(where),
    ]);
    const clientIds = [...new Set(rows.map((row) => row.clientId))];
    const [phones, notes] = await Promise.all([
      this.phonesOf(clientIds),
      this.lastNotesOf(clientIds),
    ]);
    return {
      items: rows.map((row): OpportunityPipelineItem => {
        const enums = RowEnums.parse(row);
        return {
          id: row.id,
          clientId: row.clientId,
          clientKind: enums.clientKind,
          clientName: undefinedIfNull(row.clientName),
          clientTypes: enums.clientTypes,
          // Los registrados antes de las filas hijas solo tienen el principal en `clients`.
          clientPhone: phones.get(row.clientId) ?? undefinedIfNull(row.clientPhone),
          type: row.type,
          intent: row.intent,
          originChannel: row.originChannel,
          status: enums.status,
          stageId: criteria.stageId,
          propertyId: undefinedIfNull(row.propertyId),
          agentId: undefinedIfNull(row.agentId),
          branchId: undefinedIfNull(row.branchId),
          statusChangedAt: row.statusChangedAt ?? row.createdAt,
          lastNote: notes.get(row.clientId),
          referral: {
            partnerName: undefinedIfNull(row.partnerName),
            referredAt: undefinedIfNull(row.referredAt),
            result: undefinedIfNull(row.referralResult),
          },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
      total,
    };
  }

  async countByStage(criteria: OpportunityFilterCriteria): Promise<OpportunityStageCount[]> {
    const rows = await this.db
      .select({ stageId: opportunities.stageId, total: count() })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .where(and(isNotNull(opportunities.stageId), ...this.filters(criteria)))
      .groupBy(opportunities.stageId);
    return rows.flatMap((row) =>
      row.stageId === null ? [] : [{ stageId: row.stageId, count: row.total }],
    );
  }

  async count(criteria: OpportunityBulkCriteria): Promise<number> {
    return this.countWhere(and(...this.bulkFilters(criteria)));
  }

  async matchingIds(
    criteria: OpportunityBulkCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ): Promise<string[]> {
    const rows = await this.db
      .select({ id: opportunities.id })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .where(
        and(
          ...this.bulkFilters(criteria),
          page.afterId === undefined ? undefined : gt(opportunities.id, page.afterId),
        ),
      )
      .orderBy(asc(opportunities.id))
      .limit(page.limit);
    return rows.map((row) => row.id);
  }

  /** Los filtros de una acción masiva: los del pipeline, y el estado si es de una sección. */
  private bulkFilters(c: OpportunityBulkCriteria): (SQL | undefined)[] {
    return [
      c.stageId === undefined ? undefined : eq(opportunities.stageId, c.stageId),
      ...this.filters(c),
    ];
  }

  async countAssigned(
    agentId: string,
    categories: readonly OpportunityStatusValue[],
  ): Promise<number> {
    if (categories.length === 0) return 0;
    return this.countWhere(
      and(
        isNull(clients.deletedAt),
        eq(opportunities.agentId, agentId),
        inArray(opportunities.status, [...categories]),
      ),
    );
  }

  private async countWhere(where: SQL | undefined): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .where(where);
    return row?.total ?? 0;
  }

  private filters(c: OpportunityFilterCriteria): (SQL | undefined)[] {
    return [
      isNull(clients.deletedAt),
      visibleOpportunities(c.visibility),
      c.text === undefined ? undefined : matchesSearchText(clients.searchText, c.text),
      c.agentId === undefined ? undefined : eq(opportunities.agentId, c.agentId),
      c.branchId === undefined ? undefined : eq(opportunities.branchId, c.branchId),
      c.originChannel === undefined ? undefined : eq(opportunities.originChannel, c.originChannel),
      c.category === undefined ? undefined : eq(opportunities.status, c.category),
      // La PK de `client_tag_assignments` empieza por `client_id`.
      c.tagId === undefined
        ? undefined
        : sql`exists (select 1 from ${clientTagAssignments} a where a.client_id = ${opportunities.clientId} and a.tag_id = ${c.tagId})`,
      c.created.from === undefined ? undefined : gte(opportunities.createdAt, c.created.from),
      c.created.to === undefined ? undefined : lt(opportunities.createdAt, c.created.to),
      c.updated.from === undefined ? undefined : gte(opportunities.updatedAt, c.updated.from),
      c.updated.to === undefined ? undefined : lt(opportunities.updatedAt, c.updated.to),
    ];
  }

  private order(c: OpportunityListCriteria): SQL[] {
    const { field, direction } = c.sort;
    const tiebreak = by(direction, opportunities.id);
    switch (field) {
      case 'updatedAt':
        return [by(direction, opportunities.updatedAt), tiebreak];
      case 'createdAt':
        return [by(direction, opportunities.createdAt), tiebreak];
      case 'statusChangedAt':
        return [by(direction, statusChangedAt), tiebreak];
      case 'clientName':
        // Dentro de una sección: la misma expresión que `clients_name_lower_idx`.
        return [sql`lower(${clients.name}) ${sql.raw(direction)} nulls last`, tiebreak];
    }
  }

  /** El primer celular de cada contacto de la página, o si no tiene, su primer teléfono. */
  private async phonesOf(clientIds: readonly string[]): Promise<Map<string, string>> {
    const byClient = new Map<string, string>();
    if (clientIds.length === 0) return byClient;
    const rows = await this.db
      .select({ clientId: clientPhones.clientId, phoneE164: clientPhones.phoneE164 })
      .from(clientPhones)
      .where(inArray(clientPhones.clientId, [...clientIds]))
      .orderBy(clientPhones.clientId, sql`${clientPhones.kind} <> 'mobile'`, clientPhones.position);
    for (const row of rows)
      if (!byClient.has(row.clientId)) byClient.set(row.clientId, row.phoneE164);
    return byClient;
  }

  /** La última nota de cada contacto de la página (`client_activities_client_kind_occurred_idx`). */
  private async lastNotesOf(clientIds: readonly string[]): Promise<Map<string, string>> {
    const byClient = new Map<string, string>();
    if (clientIds.length === 0) return byClient;
    const rows = await this.db
      .selectDistinctOn([clientActivities.clientId], {
        clientId: clientActivities.clientId,
        text: sql<string | null>`left(${clientActivities.body}->>'text', ${NOTE_PREVIEW_LENGTH})`,
      })
      .from(clientActivities)
      .where(
        and(inArray(clientActivities.clientId, [...clientIds]), eq(clientActivities.kind, 'note')),
      )
      .orderBy(
        clientActivities.clientId,
        desc(clientActivities.occurredAt),
        desc(clientActivities.id),
      );
    for (const row of rows) if (row.text !== null) byClient.set(row.clientId, row.text);
    return byClient;
  }
}
