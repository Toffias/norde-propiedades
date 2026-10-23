import { PORTAL_CATALOG, PORTALS } from '../../../portals';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { PublicationOverview } from '../../contracts';
import { tallyPublications } from '../../domain/publication-buckets';
import { canSeePublications, PUBLISHABLE } from '../publication-support';
import type { PublicationOverviewQuery } from '../ports/publication-overview-query';

export type GetPublicationOverviewError = ForbiddenError;

/**
 * Difusión (#114): lo disponible, lo publicado en la web y los contadores de cada portal prendido.
 * Lo ve quien publica o administra los portales.
 */
export class GetPublicationOverview {
  constructor(private readonly deps: { readonly publications: PublicationOverviewQuery }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<PublicationOverview, GetPublicationOverviewError>> {
    if (!canSeePublications(actor)) return err({ type: 'Forbidden' });
    const { publications } = this.deps;

    const enabled = new Set(await publications.enabledPortals());
    const portals = PORTALS.filter((portal) => enabled.has(portal));
    const targets = portals.flatMap((portal) =>
      PORTAL_CATALOG[portal].publishes.map((kind) => ({ portal, kind })),
    );
    const [availability, tallies, missing] = await Promise.all([
      publications.availability(PUBLISHABLE),
      publications.listingTallies(portals),
      Promise.all(
        targets.map(({ portal, kind }) => publications.missingCount(portal, kind, PUBLISHABLE)),
      ),
    ]);

    return ok({
      ...availability,
      portals: portals.map((portal) => ({
        portal,
        kinds: PORTAL_CATALOG[portal].publishes.map((kind) => {
          const tally = tallies.find((t) => t.portal === portal && t.kind === kind);
          const index = targets.findIndex((t) => t.portal === portal && t.kind === kind);
          return {
            kind,
            counts: tallyPublications(tally?.tallies ?? [], missing[index] ?? 0),
            publishedOwners: tally?.publishedOwners ?? 0,
          };
        }),
      })),
    });
  }
}
