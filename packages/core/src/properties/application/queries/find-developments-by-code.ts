import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  FindDevelopmentsByCodeInputSchema,
  MAX_DEVELOPMENT_CODES,
  type FindDevelopmentsByCodeInput,
} from '../../contracts';
import type { DevelopmentListItem, DevelopmentListQuery } from '../ports/development-list-query';

export type FindDevelopmentsByCodeError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Un emprendimiento encontrado por su código: lo que hace falta para emparejarlo. */
export interface DevelopmentByCodeRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/**
 * Los emprendimientos activos con estos códigos (los de la papelera no vuelven). Lo usa otro módulo
 * para emparejar por código: los emprendimientos que Tokko publicó en un portal.
 */
export class FindDevelopmentsByCode {
  constructor(private readonly deps: { readonly developments: DevelopmentListQuery }) {}

  async execute(
    input: FindDevelopmentsByCodeInput,
    actor: Actor,
  ): Promise<Result<readonly DevelopmentByCodeRow[], FindDevelopmentsByCodeError>> {
    if (!actor.can('developments:read')) return err({ type: 'Forbidden' });
    const parsed = FindDevelopmentsByCodeInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const codes = [...new Set(parsed.data.codes)];
    if (codes.length === 0) return ok([]);
    const slice = await this.deps.developments.search({
      view: 'active',
      text: undefined,
      status: undefined,
      developmentType: undefined,
      constructionStatus: undefined,
      tagId: undefined,
      codes,
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: MAX_DEVELOPMENT_CODES,
    });
    return ok(slice.items.map(({ id, code, name }: DevelopmentListItem) => ({ id, code, name })));
  }
}
