import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetPublishedDevelopmentInputSchema,
  type GetPublishedDevelopmentInput,
  type PublishedDevelopmentDetail,
} from '../../contracts';
import { PUBLICLY_LISTED_STATUSES } from '../../domain/property-status';
import { isDevelopmentPubliclyListed } from '../../domain/public-development';
import type { PublishedDevelopmentQuery } from '../ports/published-development-query';
import { toPublishedDevelopmentDetail } from '../published-development-mapper';

export type GetPublishedDevelopmentError =
  | ForbiddenError
  | { readonly type: 'DevelopmentNotFound' }
  /**
   * Existe pero no se ofrece (cargando información o en la papelera). La web avisa y sugiere
   * otros, como con una propiedad que ya no está disponible.
   */
  | { readonly type: 'DevelopmentNotListed' };

/** Ficha pública de un emprendimiento, por el slug de su URL. */
export class GetPublishedDevelopment {
  constructor(private readonly deps: { readonly developments: PublishedDevelopmentQuery }) {}

  async execute(
    input: GetPublishedDevelopmentInput,
    actor: Actor,
  ): Promise<Result<PublishedDevelopmentDetail, GetPublishedDevelopmentError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetPublishedDevelopmentInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'DevelopmentNotFound' });
    const record = await this.deps.developments.findBySlug(
      parsed.data.slug,
      PUBLICLY_LISTED_STATUSES,
    );
    if (!record) return err({ type: 'DevelopmentNotFound' });
    if (!isDevelopmentPubliclyListed(record)) return err({ type: 'DevelopmentNotListed' });
    return ok(toPublishedDevelopmentDetail(record));
  }
}
