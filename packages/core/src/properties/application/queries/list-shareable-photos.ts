import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  ListShareablePhotosInputSchema,
  type ListShareablePhotosInput,
  type ShareablePhoto,
} from '../../contracts';
import type { MediaItemSnapshot } from '../../domain/media-item';
import { publicImageKey } from '../../domain/public-listing';
import { idOf } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type ListShareablePhotosError = ForbiddenError | InvalidInputError | PropertyNotFoundError;

/** Portada primero; después, el orden de la galería. */
function byCoverThenPosition(a: MediaItemSnapshot, b: MediaItemSnapshot): number {
  if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
  return a.position - b.position;
}

/**
 * Las fotos que se pueden publicar fuera del panel (portales), con una URL firmada que vence. Son
 * las mismas que publica la web: fotos y planos marcados "Mostrar en la web" con su versión lista,
 * con marca de agua si Mi empresa la activó. Nunca la original. Las fotos importadas sin archivo
 * propio van con su link `https://`. Sin storage que firme (disco local), no hay fotos.
 */
export class ListShareablePhotos {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: ListShareablePhotosInput,
    actor: Actor,
  ): Promise<Result<readonly ShareablePhoto[], ListShareablePhotosError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListShareablePhotosInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { expiresInSeconds, limit } = parsed.data;
    const id = idOf<'Property'>(parsed.data.propertyId);
    if (id === undefined) return err({ type: 'PropertyNotFound' });

    const items = await this.deps.uow.run(async (tx) => {
      const property = await tx.properties.findById(id);
      return property ? tx.media.listForOwner({ kind: 'property', id }) : undefined;
    });
    if (items === undefined) return err({ type: 'PropertyNotFound' });

    const photos: ShareablePhoto[] = [];
    for (const media of items.map((item) => item.toSnapshot()).sort(byCoverThenPosition)) {
      if (photos.length >= limit) break;
      const url = await this.#urlOf(media, expiresInSeconds);
      if (url !== undefined) {
        photos.push({ mediaId: media.id, version: media.updatedAt.toISOString(), url });
      }
    }
    return ok(photos);
  }

  async #urlOf(media: MediaItemSnapshot, expiresInSeconds: number): Promise<string | undefined> {
    const source = {
      kind: media.kind,
      storageKey: media.storageKey ?? null,
      externalUrl: media.externalUrl ?? null,
      showOnWeb: media.showOnWeb,
      processing: media.processing,
      variants: media.variants,
    };
    if (media.storageKey === undefined) {
      const imported = media.kind === 'photo' && media.showOnWeb ? media.externalUrl : undefined;
      return imported?.startsWith('https://') ? imported : undefined;
    }
    const key = publicImageKey(source);
    return key === undefined ? undefined : this.deps.storage.signedUrl(key, { expiresInSeconds });
  }
}
