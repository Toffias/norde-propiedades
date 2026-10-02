import type { VisibilityFilter } from '../../../identity';
import type { PageSlice } from '../../../shared';
import type {
  ClientKindValue,
  ClientTypeValue,
  ContactChannelValue,
  OpportunitySortField,
  OpportunityStageCount,
  OpportunityStatusValue,
} from '../../contracts';

/** Los filtros del pipeline ya resueltos: fechas como instantes UTC y visibilidad del actor. */
export interface OpportunityFilterCriteria {
  /** Qué oportunidades puede ver el actor, por el agente y la sucursal de la oportunidad. */
  readonly visibility: VisibilityFilter;
  readonly text: string | undefined;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly tagId: string | undefined;
  readonly originChannel: ContactChannelValue | undefined;
  readonly category: OpportunityStatusValue | undefined;
  /** `[from, to)`. */
  readonly created: { readonly from: Date | undefined; readonly to: Date | undefined };
  readonly updated: { readonly from: Date | undefined; readonly to: Date | undefined };
}

/** Los filtros, en un estado o en todos: lo que abarca "todas las que cumplen" de una acción masiva. */
export interface OpportunityBulkCriteria extends OpportunityFilterCriteria {
  readonly stageId: string | undefined;
}

export interface OpportunityListCriteria extends OpportunityFilterCriteria {
  readonly stageId: string;
  readonly sort: { readonly field: OpportunitySortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Una fila tal como sale de la base: los usuarios por ID y el teléfono sin enmascarar. */
export interface OpportunityPipelineItem {
  readonly id: string;
  readonly clientId: string;
  readonly clientKind: ClientKindValue;
  readonly clientName: string | undefined;
  readonly clientTypes: readonly ClientTypeValue[];
  /** El primer celular, o si no tiene, el primer teléfono (E.164). */
  readonly clientPhone: string | undefined;
  readonly type: string;
  readonly intent: string;
  readonly originChannel: string;
  readonly status: OpportunityStatusValue;
  readonly stageId: string;
  readonly propertyId: string | undefined;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly statusChangedAt: Date;
  /** La última nota del contacto. */
  readonly lastNote: string | undefined;
  readonly referral: {
    readonly partnerName: string | undefined;
    readonly referredAt: Date | undefined;
    readonly result: string | undefined;
  };
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** El pipeline de oportunidades, paginado y contado en la base. */
export interface OpportunityPipelineQuery {
  search(criteria: OpportunityListCriteria): Promise<PageSlice<OpportunityPipelineItem>>;
  /** Cuántas cumplen los filtros en cada estado (un `GROUP BY`). Solo los que tienen alguna. */
  countByStage(criteria: OpportunityFilterCriteria): Promise<OpportunityStageCount[]>;
  /** Cuántas cumplen los filtros (en un estado, o en todos). */
  count(criteria: OpportunityBulkCriteria): Promise<number>;
  /**
   * Los IDs que cumplen los filtros, por ID y desde `afterId`: una acción masiva los recorre por
   * clave, así un cambio que saca una del filtro no hace saltear otra.
   */
  matchingIds(
    criteria: OpportunityBulkCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ): Promise<string[]>;
  /** Cuántas de estas categorías tiene asignadas el agente (el contador del menú). */
  countAssigned(agentId: string, categories: readonly OpportunityStatusValue[]): Promise<number>;
}
