import type { VisibilityFilter } from '../../../identity';
import type { PageSlice } from '../../../shared';
import type {
  ClientKindValue,
  ClientLetter,
  ClientLetterCount,
  ClientSortField,
  ClientTaggedValue,
  ClientTypeValue,
  ClientViewValue,
} from '../../contracts';

/** Los filtros del listado ya resueltos: fechas como instantes UTC y visibilidad del actor. */
export interface ClientFilterCriteria {
  readonly view: ClientViewValue;
  /** Qué contactos puede ver el actor (los suyos, los de su sucursal o todos), resuelto en SQL. */
  readonly visibility: VisibilityFilter;
  readonly text: string | undefined;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly kind: ClientKindValue | undefined;
  readonly clientType: ClientTypeValue | undefined;
  readonly tagged: ClientTaggedValue | undefined;
  readonly tagId: string | undefined;
  /** La inicial del nombre sin acentos; `#` si no empieza con una letra. */
  readonly letter: ClientLetter | undefined;
  /** Solo los que tienen alguno de estos tipos (propietarios). */
  readonly anyOfTypes: readonly ClientTypeValue[] | undefined;
  /** `[from, to)`. */
  readonly created: { readonly from: Date | undefined; readonly to: Date | undefined };
  readonly updated: { readonly from: Date | undefined; readonly to: Date | undefined };
}

export interface ClientListCriteria extends ClientFilterCriteria {
  readonly sort: { readonly field: ClientSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Una fila tal como sale de la base: los usuarios por ID y los datos de contacto sin enmascarar. */
export interface ClientListItem {
  readonly id: string;
  readonly kind: ClientKindValue;
  readonly name: string | undefined;
  readonly companyName: string | undefined;
  readonly phone: string | undefined;
  readonly mobile: string | undefined;
  readonly email: string | undefined;
  readonly clientTypes: readonly ClientTypeValue[];
  readonly agentId: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export interface ClientListQuery {
  search(criteria: ClientListCriteria): Promise<PageSlice<ClientListItem>>;
  count(criteria: ClientFilterCriteria): Promise<number>;
  /** Cuántos cumplen los filtros en cada letra (sin el filtro de letra). Solo las que tienen alguno. */
  letters(criteria: ClientFilterCriteria): Promise<ClientLetterCount[]>;
}
