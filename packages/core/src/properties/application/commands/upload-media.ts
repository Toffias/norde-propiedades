import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { FileStorage } from '../../../settings';
import { UploadMediaInputSchema, type UploadMediaInput } from '../../contracts';
import {
  MAX_MEDIA_PER_OWNER,
  MediaItem,
  type MediaTooLargeError,
  type UnsupportedMediaTypeError,
} from '../../domain/media-item';
import {
  canEditMedia,
  childState,
  loadActiveOwner,
  mediaAuditState,
  mediaKey,
  ownerTarget,
  toMediaOwner,
  type EditMediaError,
  type TooManyMediaError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UploadMediaError =
  EditMediaError | UnsupportedMediaTypeError | MediaTooLargeError | TooManyMediaError;

/**
 * Sube una foto a la galería de una propiedad o un emprendimiento: la original va al storage tal
 * cual y queda "procesando" hasta que el job genera la miniatura, la versión web y la copia con
 * marca de agua. La primera foto es la portada. Si el registro falla, se borra lo subido.
 */
export class UploadMedia {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UploadMediaInput,
    actor: Actor,
  ): Promise<Result<{ readonly mediaId: string }, UploadMediaError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = UploadMediaInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { contentType, bytes } = parsed.data;
    const valid = MediaItem.validateUpload({ contentType, sizeBytes: bytes.byteLength });
    if (valid.isErr()) return err(valid.error);
    const owner = toMediaOwner(parsed.data.owner);
    if (owner.isErr()) return err(owner.error);

    // Antes de subir nada: que exista, que la pueda editar y que tenga lugar en la galería.
    const allowed = await this.deps.uow.run(async (tx): Promise<Result<void, UploadMediaError>> => {
      const active = await loadActiveOwner(tx, actor, parsed.data.owner);
      if (active.isErr()) return err(active.error);
      if ((await tx.media.count(active.value)) >= MAX_MEDIA_PER_OWNER) {
        return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_OWNER });
      }
      return ok(undefined);
    });
    if (allowed.isErr()) return err(allowed.error);

    const id = nextId<'MediaItem'>(this.deps.ids);
    const storageKey = mediaKey(owner.value, id, 'original');
    await this.deps.storage.put({ key: storageKey, contentType, bytes });

    let result: Result<{ readonly mediaId: string }, UploadMediaError>;
    try {
      result = await this.deps.uow.run(
        async (tx): Promise<Result<{ readonly mediaId: string }, UploadMediaError>> => {
          const active = await loadActiveOwner(tx, actor, parsed.data.owner);
          if (active.isErr()) return err(active.error);
          const count = await tx.media.count(active.value);
          if (count >= MAX_MEDIA_PER_OWNER) {
            return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_OWNER });
          }
          const gallery = count === 0 ? [] : await tx.media.listForOwner(active.value);
          const uploaded = MediaItem.upload({
            id,
            owner: active.value,
            storageKey,
            contentType,
            sizeBytes: bytes.byteLength,
            position: await tx.media.nextPosition(active.value),
            isCover: !gallery.some((item) => item.isCover),
            uploadedBy: actor.id,
            now: this.deps.clock.now(),
          });
          if (uploaded.isErr()) return err(uploaded.error);
          const item = uploaded.value;

          await tx.media.save(item, actor.id);
          await tx.events.publish(item.pullEvents());
          await tx.audit.record(
            auditAction(
              actor,
              ownerTarget('media_added', active.value),
              diffChanges({}, childState(`media.${item.id}`, mediaAuditState(item))),
            ),
          );
          return ok({ mediaId: item.id });
        },
      );
    } catch (error) {
      await this.deps.storage.delete(storageKey);
      throw error;
    }
    if (result.isErr()) await this.deps.storage.delete(storageKey);
    return result;
  }
}
