import type { PageSlice } from '../../../shared';

/** Con qué datos de la consulta se buscan los clientes: los dos normalizados como en el dominio. */
export interface InquiryMatchCriteria {
  /** `Phone.matchKey`. */
  readonly phoneMatchKey: string | undefined;
  /** En minúsculas. */
  readonly email: string | undefined;
  readonly offset: number;
  readonly limit: number;
}

/** Un cliente tal como sale de la base, con el agente por ID. */
export interface InquiryMatchItem {
  readonly id: string;
  readonly name: string | undefined;
  readonly companyName: string | undefined;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly matchedByPhone: boolean;
  readonly matchedByEmail: boolean;
  readonly createdAt: Date;
  readonly lastContactAt: Date | undefined;
  readonly deletedAt: Date | undefined;
}

/**
 * Los clientes que comparten el teléfono o el email de una consulta, en cualquiera de los suyos y
 * también en la papelera. Primero los que coinciden por teléfono, después los activos, después el
 * último que se actualizó.
 */
export interface InquiryMatchQuery {
  search(criteria: InquiryMatchCriteria): Promise<PageSlice<InquiryMatchItem>>;
}
