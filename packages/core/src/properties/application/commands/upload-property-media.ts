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
import { UploadPropertyMediaInputSchema, type UploadPropertyMediaInput } from '../../contracts';
import {
  MAX_MEDIA_PER_PROPERTY,
  MediaItem,
  type MediaTooLargeError,
  type UnsupportedMediaTypeError,
} from '../../domain/media-item';
import type { PropertyInTrashError } from '../../domain/property';
import { childState, mediaAuditState, mediaKey, type TooManyMediaError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type UploadPropertyMediaError =
  | EditPropertyError
  | PropertyInTrashError
  | UnsupportedMediaTypeError
  | MediaTooLargeError
  | TooManyMediaError;

/**
 * Sube una foto a la galería: la original va al storage tal cual y queda "procesando" hasta que el
 * job genera la miniatura, la versión web y la copia con marca de agua. La primera foto es la
 * portada. Si el registro falla, se borra lo subido.
 */
export class UploadPropertyMedia {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UploadPropertyMediaInput,
    actor: Actor,
  ): Promise<Result<{ readonly mediaId: string }, UploadPropertyMediaError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UploadPropertyMediaInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, contentType, bytes } = parsed.data;
    const valid = MediaItem.validateUpload({ contentType, sizeBytes: bytes.byteLength });
    if (valid.isErr()) return err(valid.error);

    // Antes de subir nada: que exista, que la pueda editar y que tenga lugar en la galería.
    const allowed = await this.deps.uow.run(
      async (tx): Promise<Result<void, UploadPropertyMediaError>> => {
        const property = await loadForEdit(tx, actor, propertyId);
        if (property.isErr()) return err(property.error);
        if (property.value.isDeleted) return err({ type: 'PropertyInTrash' });
        if ((await tx.media.count(property.value.id)) >= MAX_MEDIA_PER_PROPERTY) {
          return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_PROPERTY });
        }
        return ok(undefined);
      },
    );
    if (allowed.isErr()) return err(allowed.error);

    const id = nextId<'MediaItem'>(this.deps.ids);
    const storageKey = mediaKey(propertyId, id, 'original');
    await this.deps.storage.put({ key: storageKey, contentType, bytes });

    let result: Result<{ readonly mediaId: string }, UploadPropertyMediaError>;
    try {
      result = await this.deps.uow.run(
        async (tx): Promise<Result<{ readonly mediaId: string }, UploadPropertyMediaError>> => {
          const property = await loadForEdit(tx, actor, propertyId);
          if (property.isErr()) return err(property.error);
          const count = await tx.media.count(property.value.id);
          if (count >= MAX_MEDIA_PER_PROPERTY) {
            return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_PROPERTY });
          }
          const gallery = count === 0 ? [] : await tx.media.listForProperty(property.value.id);
          const uploaded = MediaItem.upload({
            id,
            propertyId: property.value.id,
            storageKey,
            contentType,
            sizeBytes: bytes.byteLength,
            position: await tx.media.nextPosition(property.value.id),
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
              propertyTarget('property.media_added', property.value.id),
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
