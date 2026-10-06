import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettingsReader, FileStorage, ImageWatermarker } from '../../../settings';
import { MediaIdInputSchema, type MediaIdInput } from '../../contracts';
import type { MediaItemId, MediaVariants } from '../../domain/media-item';
import { idOf } from '../catalog-support';
import { mediaKey } from '../media-support';
import type { ImageVariantGenerator } from '../ports/image-variant-generator';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GenerateMediaVariantsError = ForbiddenError | InvalidInputError;

/** Qué pasó con la foto: ya no existe (se borró antes de que corra el job), quedó lista o falló. */
export type MediaProcessingOutcome = 'gone' | 'ready' | 'failed';

/**
 * Lo corre el job de `MediaVariantsRequested`: genera la miniatura y la versión web de una foto (de
 * una propiedad o un emprendimiento) y, si la marca de agua está activa en Mi empresa, una copia con
 * la marca. La original nunca se modifica. Una imagen que no se puede leer queda "fallida" con el motivo, sin reintentos.
 */
export class GenerateMediaVariants {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly images: ImageVariantGenerator;
      readonly watermarker: ImageWatermarker;
      readonly settings: CompanySettingsReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MediaIdInput,
    actor: Actor,
  ): Promise<Result<MediaProcessingOutcome, GenerateMediaVariantsError>> {
    if (!actor.can('properties:process-media')) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'MediaItem'>(parsed.data.mediaId);
    if (id === undefined) return ok('gone');

    const item = await this.deps.uow.run((tx) => tx.media.findById(id));
    const originalKey = item?.storageKey;
    if (!item || originalKey === undefined) return ok('gone');
    const original = await this.deps.storage.get(originalKey);
    if (!original) {
      return ok(await this.fail(id, 'No se encontró la foto original en el storage.', actor));
    }

    const generated = await this.deps.images.generate({
      original: original.bytes,
      rotation: item.toSnapshot().rotation,
    });
    if (generated.isErr()) {
      return ok(await this.fail(id, 'La imagen está dañada o no se puede leer.', actor));
    }
    const { thumbnail, web, width, height } = generated.value;

    // Cada generación usa claves nuevas: el navegador no muestra una versión vieja de la caché.
    const version = this.deps.clock.now().getTime().toString(36);
    const thumbnailKey = mediaKey(item.owner, id, `thumbnail-${version}`);
    const webKey = mediaKey(item.owner, id, `web-${version}`);
    await this.deps.storage.put({ key: thumbnailKey, contentType: 'image/jpeg', bytes: thumbnail });
    await this.deps.storage.put({ key: webKey, contentType: 'image/jpeg', bytes: web });
    const watermarkedKey = await this.watermark(
      web,
      mediaKey(item.owner, id, `watermarked-${version}`),
    );

    const variants: MediaVariants = {
      thumbnail: thumbnailKey,
      web: webKey,
      ...(watermarkedKey === undefined ? {} : { watermarked: watermarkedKey }),
    };
    const created = [
      thumbnailKey,
      webKey,
      ...(watermarkedKey === undefined ? [] : [watermarkedKey]),
    ];
    const stale = item.storageKeys.filter((key) => key !== originalKey);

    const saved = await this.deps.uow.run(async (tx): Promise<boolean> => {
      const current = await tx.media.findById(id);
      if (!current) return false;
      const completed = current.completeProcessing(
        { variants, width, height },
        this.deps.clock.now(),
      );
      if (completed.isErr()) return false;
      await tx.media.save(current, actor.id);
      await tx.events.publish(current.pullEvents());
      return true;
    });
    // Guardado: sobran las variantes anteriores. Si la foto se borró mientras tanto, las nuevas.
    for (const key of saved ? stale : created) await this.deps.storage.delete(key);
    return ok(saved ? 'ready' : 'gone');
  }

  /** La copia con marca de agua, si está activa y tiene logo. Devuelve su clave. */
  private async watermark(web: Uint8Array, key: string): Promise<string | undefined> {
    const { watermark } = await this.deps.settings.get();
    const logoKey = watermark.logoKey;
    if (!watermark.enabled || logoKey === undefined) return undefined;
    const logo = await this.deps.storage.get(logoKey);
    if (!logo) return undefined;
    const marked = await this.deps.watermarker.apply({ photo: web, logo: logo.bytes, watermark });
    if (marked.isErr()) return undefined;
    await this.deps.storage.put({ key, contentType: 'image/jpeg', bytes: marked.value });
    return key;
  }

  private fail(id: MediaItemId, reason: string, actor: Actor): Promise<MediaProcessingOutcome> {
    return this.deps.uow.run(async (tx): Promise<MediaProcessingOutcome> => {
      const item = await tx.media.findById(id);
      if (!item) return 'gone';
      item.failProcessing(reason, this.deps.clock.now());
      await tx.media.save(item, actor.id);
      await tx.events.publish(item.pullEvents());
      return 'failed';
    });
  }
}
