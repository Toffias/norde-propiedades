import { OWNERSHIP_RULES, visibilityFilter } from '../../../identity';
import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  PropertyInterestQuerySchema,
  type InterestedClientRow,
  type PropertyInterestInput,
} from '../../contracts';
import type {
  AgentNames,
  PropertyInterestQuery,
  PropertyProfiles,
} from '../ports/property-interest-query';

export type ListPropertyInterestedClientsError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | { readonly type: 'PropertyNotFound' };

/**
 * Potenciales interesados de una propiedad: los clientes con una búsqueda guardada que coincide,
 * entre los que el actor puede ver. Paginado en la base.
 */
export class ListPropertyInterestedClients {
  constructor(
    private readonly deps: {
      readonly profiles: PropertyProfiles;
      readonly interest: PropertyInterestQuery;
      readonly agents: AgentNames;
    },
  ) {}

  async execute(
    input: PropertyInterestInput,
    actor: Actor,
  ): Promise<Result<Page<InterestedClientRow>, ListPropertyInterestedClientsError>> {
    const visibility = visibilityFilter(actor, OWNERSHIP_RULES.clientsRead);
    if (visibility.kind === 'none') return err({ type: 'Forbidden' });
    const parsed = PropertyInterestQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { propertyId, page, pageSize } = parsed.data;
    const profile = await this.deps.profiles.find(propertyId, actor);
    if (!profile) return err({ type: 'PropertyNotFound' });

    const slice = await this.deps.interest.interested({
      profile,
      visibility,
      ...toOffsetLimit({ page, pageSize }),
    });
    const agentIds = slice.items.flatMap((item) => (item.agentId ? [item.agentId] : []));
    const names = await this.deps.agents.names([...new Set(agentIds)]);
    const items = slice.items.map(({ agentId, ...item }) => ({
      ...item,
      agent: agentId === undefined ? undefined : { id: agentId, name: names.get(agentId) },
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
