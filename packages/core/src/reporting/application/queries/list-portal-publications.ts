import { portalPublishes } from '../../../portals';
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
  ListPortalPublicationsQuerySchema,
  type ListPortalPublicationsQuery,
  type PortalPublicationRow,
} from '../../contracts';
import { publicationCriteria } from '../../domain/publication-buckets';
import { invalidInput, type InvalidInputError } from '../home-support';
import { canSeePublications, PUBLISHABLE } from '../publication-support';
import type { PublicationOverviewQuery } from '../ports/publication-overview-query';

/** La cuenta no publica ese tipo de aviso (las propiedades de la cuenta de emprendimientos). */
export interface PortalKindNotPublishedError {
  readonly type: 'PortalKindNotPublished';
}

export type ListPortalPublicationsError =
  ForbiddenError | InvalidInputError | PortalKindNotPublishedError;

/**
 * Difusión (#114): las publicaciones de un portal detrás de un contador (simples, destacadas, a
 * revisar, con error…) o lo disponible sin aviso ahí, paginado en la base.
 */
export class ListPortalPublications {
  constructor(private readonly deps: { readonly publications: PublicationOverviewQuery }) {}

  async execute(
    input: ListPortalPublicationsQuery,
    actor: Actor,
  ): Promise<Result<Page<PortalPublicationRow>, ListPortalPublicationsError>> {
    if (!canSeePublications(actor)) return err({ type: 'Forbidden' });
    const parsed = ListPortalPublicationsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, portal, kind, bucket } = parsed.data;
    if (!portalPublishes(portal, kind)) return err({ type: 'PortalKindNotPublished' });

    const slice = await this.deps.publications.list({
      portal,
      kind,
      criteria: publicationCriteria(bucket),
      publishable: PUBLISHABLE,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
