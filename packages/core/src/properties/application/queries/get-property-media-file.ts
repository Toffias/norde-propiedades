import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  GetPropertyMediaFileInputSchema,
  type GetPropertyMediaFileInput,
  type StoredFileDelivery,
} from '../../contracts';
import { idOf } from '../catalog-support';
import type { MediaNotFoundError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GetPropertyMediaFileError = ForbiddenError | InvalidInputError | MediaNotFoundError;

/** Lo que dura una URL firmada de una foto: lo que tarda en cargar la galería. */
const SIGNED_URL_SECONDS = 5 * 60;

/**
 * Una foto de la galería para mostrarla en el panel: la miniatura, la versión web o la original.
 * Mientras las variantes se generan, se entrega la original.
 */
export class GetPropertyMediaFile {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: GetPropertyMediaFileInput,
    actor: Actor,
  ): Promise<Result<StoredFileDelivery, GetPropertyMediaFileError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = GetPropertyMediaFileInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'MediaItem'>(parsed.data.mediaId);
    const item =
      id === undefined ? undefined : await this.deps.uow.run((tx) => tx.media.findById(id));
    const snapshot = item?.toSnapshot();
    if (snapshot?.storageKey === undefined) return err({ type: 'MediaNotFound' });

    const { variant } = parsed.data;
    const key =
      (variant === 'original' ? undefined : snapshot.variants[variant]) ?? snapshot.storageKey;
    const url = await this.deps.storage.signedUrl(key, { expiresInSeconds: SIGNED_URL_SECONDS });
    if (url !== undefined) return ok({ kind: 'redirect', url });
    const stored = await this.deps.storage.get(key);
    if (!stored) return err({ type: 'MediaNotFound' });
    return ok({
      kind: 'content',
      fileName: key.split('/').at(-1) ?? 'foto.jpg',
      contentType: stored.contentType,
      bytes: stored.bytes,
    });
  }
}
