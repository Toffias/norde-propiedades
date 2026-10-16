import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  FindPropertiesByCodeInputSchema,
  MAX_PROPERTY_CODES,
  type FindPropertiesByCodeInput,
  type PanelPropertyRow,
} from '../../contracts';
import { idsCriteria, toPanelRows } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type FindPropertiesByCodeError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Las propiedades de la cartera con estos códigos de referencia (las borradas no vuelven). Lo usa
 * otro módulo para emparejar por código: los avisos que Tokko publicó en un portal.
 */
export class FindPropertiesByCode {
  constructor(
    private readonly deps: {
      readonly properties: PanelPropertyListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: FindPropertiesByCodeInput,
    actor: Actor,
  ): Promise<Result<readonly PanelPropertyRow[], FindPropertiesByCodeError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = FindPropertiesByCodeInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const codes = [...new Set(parsed.data.codes)];
    if (codes.length === 0) return ok([]);
    const slice = await this.deps.properties.search({
      ...idsCriteria(undefined),
      codes,
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: MAX_PROPERTY_CODES,
    });
    return ok(await toPanelRows(slice.items, this.deps.users));
  }
}
