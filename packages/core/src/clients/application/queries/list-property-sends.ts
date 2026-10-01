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
  PropertySendsQuerySchema,
  type PropertySendRow,
  type PropertySendsInput,
} from '../../contracts';
import type { AgentNames, PropertyInterestQuery } from '../ports/property-interest-query';

export type ListPropertySendsError =
  ForbiddenError | { readonly type: 'InvalidInput'; readonly issues: readonly string[] };

/**
 * Historial de envíos de la ficha a clientes (email y WhatsApp) con lo que hizo cada uno: si abrió
 * el link y si le gustó. Solo los clientes que el actor puede ver. Los envíos los crea #11.
 */
export class ListPropertySends {
  constructor(
    private readonly deps: {
      readonly interest: PropertyInterestQuery;
      readonly agents: AgentNames;
    },
  ) {}

  async execute(
    input: PropertySendsInput,
    actor: Actor,
  ): Promise<Result<Page<PropertySendRow>, ListPropertySendsError>> {
    const visibility = visibilityFilter(actor, OWNERSHIP_RULES.clientsRead);
    if (visibility.kind === 'none') return err({ type: 'Forbidden' });
    const parsed = PropertySendsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { propertyId, page, pageSize } = parsed.data;
    const slice = await this.deps.interest.sends({
      propertyId,
      visibility,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.agents.names([...new Set(slice.items.map((i) => i.sentBy))]);
    const items = slice.items.map((item) => ({
      ...item,
      sentBy: { id: item.sentBy, name: names.get(item.sentBy) },
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
