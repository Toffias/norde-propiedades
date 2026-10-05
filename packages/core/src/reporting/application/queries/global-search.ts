import type { ClientListRow, ListClients } from '../../../clients';
import type { ListUsers, UserListItem } from '../../../identity';
import type {
  DevelopmentRow,
  ListDevelopments,
  ListPanelProperties,
  PanelPropertyRow,
} from '../../../properties';
import { err, ok, type Actor, type Page, type Result } from '../../../shared';
import {
  GLOBAL_SEARCH_KINDS,
  GLOBAL_SEARCH_LIMIT,
  GlobalSearchQuerySchema,
  type GlobalSearchGroup,
  type GlobalSearchHit,
  type GlobalSearchKind,
  type GlobalSearchQuery,
  type GlobalSearchResult,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../home-support';

export type GlobalSearchError = InvalidInputError;

/** Las búsquedas de cada módulo: el buscador las reusa con sus permisos, alcances e índices. */
export interface GlobalSearchSources {
  readonly clients: Pick<ListClients, 'execute'>;
  readonly properties: Pick<ListPanelProperties, 'execute'>;
  readonly developments: Pick<ListDevelopments, 'execute'>;
  readonly agents: Pick<ListUsers, 'execute'>;
}

type PageResult<T> = Result<Page<T>, { readonly type: string }>;

/**
 * Buscador de la barra superior: los primeros resultados de cada tipo elegido. Cada módulo decide
 * qué ve el actor (un agente, sus contactos); un tipo que no puede ver no aparece en el resultado.
 */
export class GlobalSearch {
  constructor(private readonly deps: GlobalSearchSources) {}

  async execute(
    input: GlobalSearchQuery,
    actor: Actor,
  ): Promise<Result<GlobalSearchResult, GlobalSearchError>> {
    const parsed = GlobalSearchQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { q, kinds } = parsed.data;
    const wanted = GLOBAL_SEARCH_KINDS.filter((kind) => kinds.length === 0 || kinds.includes(kind));

    const groups = await Promise.all(wanted.map((kind) => this.search(kind, q, actor)));
    return ok({ groups: groups.filter((group) => group !== undefined) });
  }

  private async search(
    kind: GlobalSearchKind,
    q: string,
    actor: Actor,
  ): Promise<GlobalSearchGroup | undefined> {
    const page = { q, page: 1, pageSize: GLOBAL_SEARCH_LIMIT };
    switch (kind) {
      case 'clients':
        return toGroup(kind, await this.deps.clients.execute(page, actor), clientHit);
      case 'properties':
        return toGroup(kind, await this.deps.properties.execute(page, actor), propertyHit);
      case 'developments':
        return toGroup(kind, await this.deps.developments.execute(page, actor), developmentHit);
      case 'agents':
        return toGroup(kind, await this.deps.agents.execute(page, actor), agentHit);
    }
  }
}

/**
 * Un error del listado de un módulo (sin permiso, sin sucursal asignada) deja ese tipo afuera: el
 * buscador muestra solo lo que el actor puede ver.
 */
function toGroup<T>(
  kind: GlobalSearchKind,
  result: PageResult<T>,
  toHit: (row: T) => GlobalSearchHit,
): GlobalSearchGroup | undefined {
  if (result.isErr()) return undefined;
  return { kind, total: result.value.total, items: result.value.items.map(toHit) };
}

function clientHit(row: ClientListRow): GlobalSearchHit {
  const title = row.name ?? row.companyName ?? '';
  return {
    id: row.id,
    code: undefined,
    title,
    detail: row.name === undefined ? undefined : row.companyName,
  };
}

function propertyHit(row: PanelPropertyRow): GlobalSearchHit {
  return {
    id: row.id,
    code: row.code,
    title: row.portalTitle,
    detail:
      row.publishAddress ?? ([row.neighborhood, row.city].filter(Boolean).join(', ') || undefined),
  };
}

function developmentHit(row: DevelopmentRow): GlobalSearchHit {
  return { id: row.id, code: row.code, title: row.name, detail: row.publishAddress };
}

function agentHit(row: UserListItem): GlobalSearchHit {
  return { id: row.id, code: undefined, title: row.name, detail: row.email };
}
