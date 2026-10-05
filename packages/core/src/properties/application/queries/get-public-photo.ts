import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  GetPublicPhotoInputSchema,
  publicImagePath,
  publicImageVersion,
  type GetPublicPhotoInput,
  type PublicPhotoDelivery,
} from '../../contracts';
import { isPubliclyListed } from '../../domain/property-status';
import { isPublicImage, publicImageKey } from '../../domain/public-listing';
import type { PropertySearchQuery } from '../ports/property-search-query';

/** No existe, no se publica o su propiedad no está publicada: la web responde 404 igual. */
export type GetPublicPhotoError = ForbiddenError | { readonly type: 'PhotoNotFound' };

/**
 * Una foto o un plano de una propiedad publicada, para la ruta `/fotos/<id>/<versión>` de la
 * web: la versión web (o la de marca de agua), nunca la original (ADR 0023).
 */
export class GetPublicPhoto {
  constructor(
    private readonly deps: {
      readonly properties: PropertySearchQuery;
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

    const property = await this.deps.properties.findByMediaId(mediaId);
    const media = property?.media.find((m) => m.id === mediaId);
    if (!property || !media || !isPubliclyListed(property) || !isPublicImage(media)) {
      return err({ type: 'PhotoNotFound' });
    }

    if (media.storageKey === null && media.externalUrl !== null) {
      return ok({ kind: 'external', url: media.externalUrl });
    }
    const current = publicImageVersion(media.updatedAt);
    if (version !== current) return ok({ kind: 'moved', path: publicImagePath(mediaId, current) });

    const key = publicImageKey(media);
    const stored = key === undefined ? undefined : await this.deps.storage.get(key);
    if (!stored) return err({ type: 'PhotoNotFound' });
    return ok({ kind: 'content', contentType: stored.contentType, bytes: stored.bytes });
  }
}
