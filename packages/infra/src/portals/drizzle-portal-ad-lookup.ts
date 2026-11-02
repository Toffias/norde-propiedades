import type { PortalAdLookup, PortalAdReference } from '@norde/core/portals';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { listingPermalink } from '../adapters/portals/zonaprop/zonaprop-listing';
import type { DbExecutor } from '../db/executor';
import { portalListings } from '../db/schema';

/**
 * La propiedad de un aviso. En MercadoLibre el número del link es el id del ítem (`external_id`,
 * por `portal_listings_portal_external_uq`). En Zonaprop no: el `external_id` es el código que
 * le manda Norde, y el número del link solo está en el permalink que se guardó al publicar
 * (`portal_listings_portal_permalink_idx`).
 */
export class DrizzlePortalAdLookup implements PortalAdLookup {
  constructor(private readonly db: DbExecutor) {}

  async propertyIdFor(reference: PortalAdReference): Promise<string | undefined> {
    const match =
      reference.provider === 'mercadolibre'
        ? and(
            eq(portalListings.portal, 'mercadolibre'),
            eq(portalListings.externalId, reference.itemId),
          )
        : and(
            eq(portalListings.portal, 'zonaprop'),
            eq(portalListings.permalink, listingPermalink(reference.postingId)),
          );
    const [row] = await this.db
      .select({ propertyId: portalListings.propertyId })
      .from(portalListings)
      .where(
        and(
          match,
          isNotNull(portalListings.propertyId),
          // Uno dado de baja ya no es un aviso vivo de Norde.
          inArray(portalListings.status, ['published', 'paused']),
        ),
      )
      .limit(1);
    return row?.propertyId ?? undefined;
  }
}
