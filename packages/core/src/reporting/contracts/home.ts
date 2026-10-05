// Contracts de Inicio (#15): los pendientes del día y el estado de la cartera.

import { z } from 'zod';

import type { ContactChannelValue } from '../../clients/contracts';
import type {
  ConstructionStatusValue,
  Currency,
  Operation,
  PropertyStatusValue,
  PropertyType,
} from '../../properties/contracts';
import { pageQuerySchema } from '../../shared/contracts';

/** Filas que muestra cada widget de pendientes; el resto se ve en su módulo. */
export const HOME_WIDGET_LIMIT = 5;
/** Días hacia adelante de "Próximos vencimientos": las reservas con firma estimada hasta ahí. */
export const SIGNING_WINDOW_DAYS = 30;
/** Filas por página de los listados de disponibles. */
export const HOME_LIST_PAGE_SIZE = 10;

const HomeFilterFields = {
  /** Agente: las oportunidades, reservas, propiedades y emprendimientos que tiene a cargo. */
  agentId: z.uuid().optional(),
  branchId: z.uuid().optional(),
};

/** Filtros de Inicio. Se suman al alcance de quien mira: un agente ve lo suyo. */
export const HomeFilterSchema = z.object(HomeFilterFields);
export type HomeFilter = z.input<typeof HomeFilterSchema>;

export const AVAILABLE_LIST_SORT_FIELDS = ['updatedAt', 'code'] as const;

const availableListSchema = () =>
  pageQuerySchema({
    sortable: AVAILABLE_LIST_SORT_FIELDS,
    defaultSort: { field: 'updatedAt', direction: 'desc' },
  }).extend(HomeFilterFields);

export const ListAvailablePropertiesQuerySchema = availableListSchema();
export type ListAvailablePropertiesQuery = z.input<typeof ListAvailablePropertiesQuerySchema>;

export const ListAvailableDevelopmentsQuerySchema = availableListSchema();
export type ListAvailableDevelopmentsQuery = z.input<typeof ListAvailableDevelopmentsQuerySchema>;

/** Las primeras filas de un widget y cuántas hay en total. */
export interface HomeWidget<T> {
  readonly total: number;
  readonly items: readonly T[];
}

export interface AgentRef {
  readonly id: string;
  /** `undefined` si el usuario ya no está activo. */
  readonly name: string | undefined;
}

export interface UnassignedInquiryRow {
  readonly id: string;
  readonly channel: ContactChannelValue;
  readonly receivedAt: Date;
  readonly senderName: string | undefined;
  readonly propertyId: string | undefined;
  readonly propertyCode: string | undefined;
  readonly developmentId: string | undefined;
  readonly developmentName: string | undefined;
}

export interface PendingOpportunityRow {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly stageName: string;
  readonly stageColor: string;
  readonly originChannel: ContactChannelValue | undefined;
  readonly agent: AgentRef | undefined;
  /** Desde cuándo está sin contactar: el último cambio de estado o el alta. */
  readonly waitingSince: Date;
}

export interface UpcomingSigningRow {
  readonly id: string;
  readonly propertyId: string;
  readonly propertyCode: string;
  readonly propertyTitle: string;
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly agent: AgentRef | undefined;
  /** `AAAA-MM-DD`. */
  readonly estimatedSigningDate: string;
  /** La fecha estimada ya pasó y la reserva sigue activa. */
  readonly overdue: boolean;
}

export interface CountByChannel {
  /** `undefined`: oportunidades sin canal de origen. */
  readonly channel: ContactChannelValue | undefined;
  readonly count: number;
  /** Porcentaje sobre el total, con un decimal. */
  readonly share: number;
}

export interface CountByStage {
  readonly stageId: string;
  readonly name: string;
  readonly color: string;
  readonly count: number;
}

export interface CountByPropertyStatus {
  readonly status: PropertyStatusValue;
  readonly count: number;
}

/**
 * El estado de la cartera. Cada parte viene solo si quien mira tiene el permiso de ese módulo
 * (`undefined` si no).
 */
export interface PortfolioSummary {
  readonly clientsWithOpenOpportunity: number | undefined;
  readonly openOpportunitiesByChannel: readonly CountByChannel[] | undefined;
  readonly openOpportunitiesByStage: readonly CountByStage[] | undefined;
  readonly propertiesByStatus: readonly CountByPropertyStatus[] | undefined;
  readonly availableDevelopments: number | undefined;
}

export interface AvailablePropertyRow {
  readonly id: string;
  readonly code: string;
  readonly propertyType: PropertyType;
  readonly title: string;
  readonly neighborhood: string;
  readonly operations: readonly {
    readonly operation: Operation;
    readonly currency: Currency;
    /** `null`: sin precio cargado o "precio a consultar". */
    readonly priceCents: bigint | null;
  }[];
  readonly agent: AgentRef | undefined;
  readonly updatedAt: Date;
}

export interface AvailableDevelopmentRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string | undefined;
  readonly constructionStatus: ConstructionStatusValue | undefined;
  /** Unidades disponibles del emprendimiento. */
  readonly availableUnits: number;
  readonly agent: AgentRef | undefined;
  readonly updatedAt: Date;
}
