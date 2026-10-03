import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  DevelopmentMapQuerySchema,
  MAX_DEVELOPMENT_MAP_PINS,
  type DevelopmentMapQuery,
  type DevelopmentMapResult,
} from '../../contracts';
import type { DevelopmentListQuery } from '../ports/development-list-query';

export type GetDevelopmentMapError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Pines del mapa de emprendimientos: los activos con coordenadas dentro del área visible que
 * cumplen los filtros del listado. Como mucho `MAX_DEVELOPMENT_MAP_PINS`; si hay más, se avisa para
 * que se acerque el mapa.
 */
export class GetDevelopmentMap {
  constructor(private readonly deps: { readonly developments: DevelopmentListQuery }) {}

  async execute(
    input: DevelopmentMapQuery,
    actor: Actor,
  ): Promise<Result<DevelopmentMapResult, GetDevelopmentMapError>> {
    if (!actor.can('developments:read')) return err({ type: 'Forbidden' });
    const parsed = DevelopmentMapQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { south, west, north, east, q, status, developmentType, constructionStatus, tagId } =
      parsed.data;
    const slice = await this.deps.developments.mapPins(
      { text: q, status, developmentType, constructionStatus, tagId },
      { south, west, north, east },
      MAX_DEVELOPMENT_MAP_PINS,
    );
    return ok({
      pins: slice.items,
      total: slice.total,
      truncated: slice.total > slice.items.length,
    });
  }
}
