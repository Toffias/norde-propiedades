import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  GetPublicPhotoInputSchema,
  publicImagePath,
  publicImageVersion,
  type GetPublicPhotoInput,
  type PublicPhotoDelivery,
} from '../../contracts';
import {
  isListedOnWeb,
  PUBLICLY_LISTED_STATUSES,
  type PropertyStatus,
} from '../../domain/property-status';
import { isDevelopmentPubliclyListed } from '../../domain/public-development';
import { isPublicImage, publicImageKey, reservedCoverKey } from '../../domain/public-listing';
import type { PropertyMediaRecord, PropertySearchQuery } from '../ports/property-search-query';
import type { PublishedDevelopmentQuery } from '../ports/published-development-query';

/**
 * No existe, no se publica o su propiedad (o emprendimiento) no está publicado: la web responde
 * 404 igual.
 */
export type GetPublicPhotoError = ForbiddenError | { readonly type: 'PhotoNotFound' };

/**
 * Una foto o un plano de una propiedad o un emprendimiento publicados, para la ruta
 * `/fotos/<id>/<versión>` de la web: la versión web (o la de marca de agua), nunca la original
 * (ADR 0023).
 */
export class GetPublicPhoto {
  constructor(
    private readonly deps: {
      readonly properties: PropertySearchQuery;
      readonly developments: PublishedDevelopmentQuery;
      readonly storage: FileStorage;
    },
  ) {}

  async execute(
    input: GetPublicPhotoInput,
    actor: Actor,
  ): Promise<Result<PublicPhotoDelivery, GetPublicPhotoError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = GetPublicPhotoInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'PhotoNotFound' });
    const { mediaId, version } = parsed.data;

    const published = await this.findPublished(mediaId);
    const media = published?.media;
    if (!published || !media || !isPublicImage(media)) return err({ type: 'PhotoNotFound' });

    if (media.storageKey === null && media.externalUrl !== null) {
      return ok({ kind: 'external', url: media.externalUrl });
    }
    // Reservada, la portada se sirve con el banner, en su propia URL (la de antes queda vieja).
    const reservedKey =
      published.status === undefined ? undefined : reservedCoverKey(media, published.status);
    const current = publicImageVersion(media.updatedAt, reservedKey !== undefined);
    if (version !== current) return ok({ kind: 'moved', path: publicImagePath(mediaId, current) });

    const key = reservedKey ?? publicImageKey(media);
    const stored = key === undefined ? undefined : await this.deps.storage.get(key);
    if (!stored) return err({ type: 'PhotoNotFound' });
    return ok({ kind: 'content', contentType: stored.contentType, bytes: stored.bytes });
  }

  /**
   * La foto, si su dueño (una propiedad o un emprendimiento) se muestra al público, con el estado
   * de la propiedad (un emprendimiento no tiene).
   */
  private async findPublished(mediaId: string): Promise<
    | {
        readonly media: PropertyMediaRecord | undefined;
        readonly status: PropertyStatus | undefined;
      }
    | undefined
  > {
    const property = await this.deps.properties.findByMediaId(mediaId);
    if (property) {
      if (!isListedOnWeb(property)) return undefined;
      return { media: property.media.find((m) => m.id === mediaId), status: property.status };
    }
    const development = await this.deps.developments.findByMediaId(
      mediaId,
      PUBLICLY_LISTED_STATUSES,
    );
    if (!development || !isDevelopmentPubliclyListed(development)) return undefined;
    return { media: development.media.find((m) => m.id === mediaId), status: undefined };
  }
}
