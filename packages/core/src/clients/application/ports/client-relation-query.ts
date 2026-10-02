import type { PageSlice } from '../../../shared';
import type { ClientKindValue, ClientRelationKindValue } from '../../contracts';

/** Una relación del contacto, en cualquiera de los dos sentidos, con el otro contacto. */
export interface ClientRelationItem {
  readonly direction: 'outgoing' | 'incoming';
  readonly kind: ClientRelationKindValue;
  readonly label: string | undefined;
  readonly other: {
    readonly id: string;
    readonly name: string | undefined;
    readonly kind: ClientKindValue;
    readonly agentId: string | undefined;
    readonly branchId: string | undefined;
  };
}

/**
 * Las relaciones de un contacto: las que declara y las que otros declaran hacia él, sin los
 * contactos de la papelera. Paginado por nombre del otro contacto.
 */
export interface ClientRelationQuery {
  list(criteria: {
    readonly clientId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ClientRelationItem>>;
}
