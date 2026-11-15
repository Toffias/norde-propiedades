import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettingsReader, FileStorage } from '../../../settings';
import { MediaIdInputSchema, type MediaIdInput } from '../../contracts';
import { idOf } from '../catalog-support';
import { mediaKey } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ReservedBannerRenderer } from '../ports/reserved-banner-renderer';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GenerateReservedCoverError = ForbiddenError | InvalidInputError;

/**
 * Qué pasó: la foto ya no lleva portada "Reservado" (se borró, dejó de ser la portada o todavía se
 * procesa), quedó lista, o la imagen o el banner no se pudieron leer.
 */
export type ReservedCoverOutcome = 'skipped' | 'ready' | 'failed';

/**
 * Lo corre el job de `ReservedCoverRequested`: pone el banner "Reservado" de Mi empresa (o el de
 * fábrica) sobre la portada de una propiedad y lo guarda como variante. Se genera de antemano, esté
 * reservada o no, para que reservar cambie la portada al instante. Parte de la versión con marca de
 * agua, si hay, para que la web muestre lo mismo que antes, con el banner.
 */
export class GenerateReservedCover {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly renderer: ReservedBannerRenderer;
      readonly settings: CompanySettingsReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MediaIdInput,
    actor: Actor,
  ): Promise<Result<ReservedCoverOutcome, GenerateReservedCoverError>> {
    if (!actor.can('properties:process-media')) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'MediaItem'>(parsed.data.mediaId);
    if (id === undefined) return ok('skipped');

    const item = await this.deps.uow.run((tx) => tx.media.findById(id));
    if (!item?.needsReservedCover) return ok('skipped');
    const { variants } = item.toSnapshot();
    const baseKey = variants.watermarked ?? variants.web;
    const base = baseKey === undefined ? undefined : await this.deps.storage.get(baseKey);
    // La variante se borró del storage (se regeneró mientras tanto): el job nuevo la pide otra vez.
    if (!base) return ok('skipped');

    const { reservedBannerKey } = await this.deps.settings.get();
    const banner =
      reservedBannerKey === undefined ? undefined : await this.deps.storage.get(reservedBannerKey);
    const rendered = await this.deps.renderer.render({ photo: base.bytes, banner: banner?.bytes });
    if (rendered.isErr()) return ok('failed');

    // Cada generación usa una clave nueva: el navegador no muestra una versión vieja de la caché.
    const version = this.deps.clock.now().getTime().toString(36);
    const key = mediaKey(item.owner, id, `reserved-${version}`);
    await this.deps.storage.put(
      { key, contentType: 'image/jpeg', bytes: rendered.value },
      { immutable: true },
    );

    const replaced = await this.deps.uow.run(
      async (tx): Promise<{ readonly saved: boolean; readonly previous?: string }> => {
        const current = await tx.media.findById(id);
        if (!current) return { saved: false };
        const completed = current.completeReservedCover(key, this.deps.clock.now());
        if (completed.isErr()) return { saved: false };
        await tx.media.save(current, actor.id);
        await tx.events.publish(current.pullEvents());
        return completed.value === undefined
          ? { saved: true }
          : { saved: true, previous: completed.value };
      },
    );
    // Fuera de la transacción: si falla el borrado, la portada nueva ya quedó guardada.
    if (!replaced.saved) {
      await this.deps.storage.delete(key);
      return ok('skipped');
    }
    if (replaced.previous !== undefined) await this.deps.storage.delete(replaced.previous);
    return ok('ready');
  }
}
