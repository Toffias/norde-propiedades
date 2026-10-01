import type { VisibilityFilter } from '../../../identity';
import type { Actor, PageSlice } from '../../../shared';
import type {
  InterestedClientRow,
  PropertyInterestProfile,
  PropertySendRow,
} from '../../contracts';

/** El perfil de la propiedad para el cruce: lo entrega el módulo de propiedades. */
export interface PropertyProfiles {
  /** `undefined` si no existe o el actor no la puede ver. */
  find(propertyId: string, actor: Actor): Promise<PropertyInterestProfile | undefined>;
}

/** Nombres de los usuarios del panel (identity), para mostrar agentes y quién envió. */
export interface AgentNames {
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface PropertyInterestCriteria {
  readonly profile: PropertyInterestProfile;
  /** Qué clientes puede ver el actor (los suyos, los de su sucursal o todos). */
  readonly visibility: VisibilityFilter;
  readonly offset: number;
  readonly limit: number;
}

export interface PropertySendsCriteria {
  readonly propertyId: string;
  readonly visibility: VisibilityFilter;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Cruce de una propiedad con los clientes, en SQL: las búsquedas guardadas que coinciden
 * (`matchesSavedSearch`) y los envíos de la ficha. Paginado en la base.
 */
export interface PropertyInterestQuery {
  interested(
    criteria: PropertyInterestCriteria,
  ): Promise<
    PageSlice<Omit<InterestedClientRow, 'agent'> & { readonly agentId: string | undefined }>
  >;
  sends(
    criteria: PropertySendsCriteria,
  ): Promise<PageSlice<Omit<PropertySendRow, 'sentBy'> & { readonly sentBy: string }>>;
}
