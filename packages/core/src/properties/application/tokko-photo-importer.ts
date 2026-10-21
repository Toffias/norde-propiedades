import type { FileStorage } from '../../settings';
import {
  auditAction,
  diffChanges,
  nextId,
  type Actor,
  type AuditState,
  type Clock,
  type IdGenerator,
} from '../../shared';
import { MediaItem } from '../domain/media-item';
import type { MediaOwner } from '../domain/media-owner';

import { childState, mediaAuditState, mediaKey, ownerTarget } from './media-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from './ports/properties-transaction';
import type {
  DownloadedPhoto,
  TokkoApiPhoto,
  TokkoPropertySource,
} from './ports/tokko-property-source';
import { expectOk } from './tokko-property-importer';

/** Fotos que se bajan a la vez, para no saturar a Tokko. */
const PARALLEL_DOWNLOADS = 4;

/** Una foto bajada y guardada en el storage, todavía sin registrar en la galería. */
interface StoredPhoto {
  readonly mediaId: MediaItem['id'];
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly source: TokkoApiPhoto;
}

/** Si el dueño de la galería existe y no está en la papelera. */
async function ownerIsActive(tx: PropertiesTransaction, owner: MediaOwner): Promise<boolean> {
  const found =
    owner.kind === 'property'
      ? await tx.properties.findById(owner.id)
      : await tx.developments.findById(owner.id);
  return found !== undefined && !found.isDeleted;
}

/**
 * Las fotos de una propiedad o un emprendimiento de Tokko: se bajan de Tokko al storage y se suman
 * a la galería vacía, con la portada y el orden de Tokko y los planos como planos. Quedan
 * "procesando" hasta que el job de siempre genera sus variantes.
 */
export class TokkoPhotoImporter {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly source: TokkoPropertySource;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
      /** La importación que las trae: la campanita sigue sus variantes como parte de ella. */
      readonly importId: string;
    },
  ) {}

  /** Si la galería está vacía: solo entonces se traen las fotos de Tokko. */
  async galleryIsEmpty(tx: PropertiesTransaction, owner: MediaOwner): Promise<boolean> {
    return (await tx.media.count(owner)) === 0;
  }

  /**
   * Baja las fotos y las suma a la galería. Si la galería ya no está vacía (alguien subió fotos
   * mientras tanto), no agrega nada. `failed`: alguna no se pudo bajar.
   */
  async add(
    runner: Actor,
    owner: MediaOwner,
    photos: readonly TokkoApiPhoto[],
  ): Promise<{ readonly added: number; readonly failed: boolean }> {
    if (photos.length === 0) return { added: 0, failed: false };
    const stored: StoredPhoto[] = [];
    let failed = false;
    for (let i = 0; i < photos.length; i += PARALLEL_DOWNLOADS) {
      const batch = photos.slice(i, i + PARALLEL_DOWNLOADS);
      const downloads = await Promise.all(batch.map((photo) => this.#download(photo)));
      for (const [index, download] of downloads.entries()) {
        const photo = batch[index];
        if (!download || !photo) {
          failed = true;
          continue;
        }
        const mediaId = nextId<'MediaItem'>(this.deps.ids);
        const key = mediaKey(owner, mediaId, 'original');
        await this.deps.storage.put({
          key,
          contentType: download.contentType,
          bytes: download.bytes,
        });
        stored.push({
          mediaId,
          key,
          contentType: download.contentType,
          sizeBytes: download.bytes.byteLength,
          source: photo,
        });
      }
    }
    if (stored.length === 0) return { added: 0, failed };

    let added: number;
    try {
      added = await this.deps.uow.run(async (tx) => {
        if (!(await ownerIsActive(tx, owner)) || !(await this.galleryIsEmpty(tx, owner))) return 0;
        const now = this.deps.clock.now();
        const first = await tx.media.nextPosition(owner);
        const photosOnly = stored.filter((photo) => !photo.source.isFloorPlan);
        const cover =
          photosOnly.find((photo) => photo.source.isCover) ?? photosOnly[0] ?? stored[0];
        let state: AuditState = {};
        for (const [index, photo] of stored.entries()) {
          const item = expectOk(
            MediaItem.upload({
              id: photo.mediaId,
              owner,
              storageKey: photo.key,
              contentType: photo.contentType,
              sizeBytes: photo.sizeBytes,
              position: first + index,
              isCover: photo === cover,
              uploadedBy: runner.id,
              importId: this.deps.importId,
              now,
            }),
          );
          if (photo.source.isFloorPlan) expectOk(item.update({ isFloorPlan: true }, now));
          await tx.media.save(item, runner.id);
          await tx.events.publish(item.pullEvents());
          state = { ...state, ...childState(`media.${item.id}`, mediaAuditState(item)) };
        }
        await tx.audit.record(
          auditAction(runner, ownerTarget('media_added', owner), diffChanges({}, state)),
        );
        return stored.length;
      });
    } catch (error) {
      await Promise.all(stored.map((photo) => this.deps.storage.delete(photo.key)));
      throw error;
    }
    if (added === 0) await Promise.all(stored.map((photo) => this.deps.storage.delete(photo.key)));
    return { added, failed };
  }

  /** La original o, si no sirve (no responde, no es una imagen o pesa demasiado), la versión web. */
  async #download(photo: TokkoApiPhoto): Promise<DownloadedPhoto | undefined> {
    for (const url of [photo.url, photo.fallbackUrl]) {
      if (url === undefined) continue;
      const downloaded = await this.deps.source.photo(url);
      if (downloaded.isErr()) continue;
      const valid = MediaItem.validateUpload({
        contentType: downloaded.value.contentType,
        sizeBytes: downloaded.value.bytes.byteLength,
      });
      if (valid.isOk()) return downloaded.value;
    }
    return undefined;
  }
}
