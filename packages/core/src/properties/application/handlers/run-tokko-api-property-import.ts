import type { FileStorage } from '../../../settings';
import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { MediaItem } from '../../domain/media-item';
import type { MediaOwner } from '../../domain/media-owner';
import type { Property, PropertyId } from '../../domain/property';
import type {
  PropertyImport,
  PropertyImportRowOutcome,
  PropertyImportStatus,
} from '../../domain/property-import';
import { tokkoReferenceCode } from '../../domain/tokko-property';
import { childState, mediaAuditState, mediaKey, ownerTarget } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyImportDirectory } from '../ports/property-import-directory';
import type {
  DownloadedPhoto,
  TokkoApiPhoto,
  TokkoApiProperty,
  TokkoPropertySource,
} from '../ports/tokko-property-source';
import type { Producers } from '../ports/user-names';
import {
  readTokkoApiProperty,
  TOKKO_COMMENTS_HEADING,
  type ApiImportedProperty,
} from '../property-api-import-row';
import { propertyImportTarget } from '../property-import-support';
import { propertyDetailAuditState, propertyTarget, saveEdit } from '../property-support';
import type { PropertyImportNotFoundError } from '../queries/get-property-import';
import {
  expectOk,
  TokkoPropertyImporter,
  type ImportRowProblem,
  type RowProducer,
} from '../tokko-property-importer';

import type { InvalidPropertyImportIdError } from './run-property-import';

export type RunTokkoApiPropertyImportError =
  ForbiddenError | InvalidPropertyImportIdError | PropertyImportNotFoundError;

/** Propiedades por pedido a Tokko: cada una trae todas sus fotos, así que la página es corta. */
const PAGE_SIZE = 20;
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

/**
 * El job de `properties.tokko_api_import_requested`: recorre las propiedades de Norde en la API de
 * Tokko, de a páginas y en el orden de Tokko.
 *
 * - Si el código no existe, crea la propiedad como la importación de la exportación (mismas reglas
 *   de ubicación, productor, propietarios y emprendimiento), con su título, descripción,
 *   coordenadas y fotos.
 * - Si ya existe, la completa sin pisar nada (decidido con Norde el 2026-10-20): la descripción y
 *   las coordenadas si no tiene, los comentarios internos de Tokko si no están, y las fotos si la
 *   galería está vacía.
 *
 * Las fotos se bajan de Tokko al storage y quedan "procesando" hasta que el job de siempre genera
 * sus variantes. Cada propiedad va en sus propias transacciones junto con el avance: si el job se
 * corta, retoma donde quedó, y volver a correrla no duplica nada. Si Tokko no responde, la
 * importación queda fallida con lo hecho hasta ahí.
 */
export class RunTokkoApiPropertyImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      /** Sin la API key configurada, la importación falla. */
      readonly source: TokkoPropertySource | undefined;
      readonly storage: FileStorage;
      readonly directory: PropertyImportDirectory;
      readonly producers: Producers;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: { readonly importId: string },
    actor: Actor,
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunTokkoApiPropertyImportError>> {
    if (!actor.can('properties:run-imports')) return err({ type: 'Forbidden' });
    const id = parseId<'PropertyImport'>(input.importId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const job = await this.deps.uow.run((tx) => tx.propertyImports.findById(id.value));
    if (job?.source !== 'api') return err({ type: 'PropertyImportNotFound' });
    if (job.isFinished) return ok({ status: job.status });
    const runner = actor.withCorrelation(job.id);

    await this.deps.uow.run(async (tx) => {
      job.start(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
    });
    const { source } = this.deps;
    if (!source) return this.fail(job, runner);

    const importer = new TokkoPropertyImporter(this.deps);
    const fallback = await importer.requester(job.requestedBy);
    // Retoma desde la primera propiedad que no procesó.
    let offset = job.totals.processed;
    for (;;) {
      const page = await source.page(offset, PAGE_SIZE);
      if (page.isErr()) return this.fail(job, runner);
      await this.deps.uow.run(async (tx) => {
        job.countRows(page.value.total, this.deps.clock.now());
        await tx.propertyImports.save(job, runner.id);
      });
      for (const property of page.value.properties) {
        offset += 1;
        await this.importProperty(importer, runner, job, fallback, offset, property);
      }
      if (page.value.properties.length === 0 || offset >= page.value.total) break;
    }

    await this.deps.uow.run(async (tx) => {
      job.finish(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.finished', job.id), {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: job.totals.created },
          existing: { before: null, after: job.totals.existing },
          completed: { before: null, after: job.totals.completed },
          failed: { before: null, after: job.totals.failed },
        }),
      );
    });
    return ok({ status: job.status });
  }

  private async importProperty(
    importer: TokkoPropertyImporter,
    runner: Actor,
    job: PropertyImport,
    fallback: RowProducer | undefined,
    rowNumber: number,
    property: TokkoApiProperty,
  ): Promise<void> {
    const problems: ImportRowProblem[] = [];
    let outcome: PropertyImportRowOutcome = 'failed';
    // El código como queda en Norde, para encontrarla aunque no se haya podido importar.
    let reference: string | undefined = tokkoReferenceCode(property.referenceCode) || undefined;

    const read = readTokkoApiProperty(property);
    if (read.isErr()) {
      problems.push(read.error);
    } else {
      const row = read.value;
      reference = row.code;
      const blocked = await this.deps.uow.run((tx) => importer.check(tx, row));
      if (blocked?.code === 'already_imported' && blocked.propertyId !== undefined) {
        const completed = await this.complete(runner, blocked.propertyId, row);
        problems.push(...completed.warnings);
        outcome = completed.changed ? 'completed' : 'existing';
        // Una que ya estaba completa se informa como en la exportación.
        if (!completed.changed) problems.push(blocked);
      } else if (blocked) {
        problems.push(blocked);
      } else {
        const created = await importer.create(runner, row, fallback);
        problems.push(...created.warnings);
        const photos = await this.addPhotos(runner, created.propertyId, row.photos);
        if (photos.failed) {
          problems.push({
            code: 'photos_not_downloaded',
            field: undefined,
            propertyId: created.propertyId,
          });
        }
        outcome = 'created';
      }
    }

    await this.deps.uow.run(async (tx) => {
      for (const problem of problems) {
        await tx.propertyImports.addProblem(
          job.id,
          {
            rowNumber,
            code: problem.code,
            field: problem.field,
            propertyId: problem.propertyId,
            reference,
          },
          this.deps.clock.now(),
        );
      }
      job.recordRow(outcome, this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
    });
  }

  /**
   * Le agrega a una propiedad que ya estaba lo que no tiene: descripción, coordenadas, los
   * comentarios de Tokko y las fotos. Lo cargado en Norde no se pisa.
   */
  private async complete(
    runner: Actor,
    propertyId: string,
    row: ApiImportedProperty,
  ): Promise<{ readonly changed: boolean; readonly warnings: readonly ImportRowProblem[] }> {
    const id = expectOk(parseId<'Property'>(propertyId));
    const edited = await this.deps.uow.run(async (tx) => {
      const property = await tx.properties.findById(id);
      if (!property || property.isDeleted) return { changed: false, galleryEmpty: false };
      const before = propertyDetailAuditState(property);
      const changed = this.fillGaps(property, row);
      if (changed) {
        await saveEdit(
          tx,
          property,
          runner,
          auditAction(
            runner,
            propertyTarget('property.import_completed', property.id),
            diffChanges(before, propertyDetailAuditState(property)),
          ),
        );
      }
      const galleryEmpty = (await tx.media.count({ kind: 'property', id })) === 0;
      return { changed, galleryEmpty };
    });
    if (!edited.galleryEmpty || row.photos.length === 0) {
      return { changed: edited.changed, warnings: [] };
    }
    const photos = await this.addPhotos(runner, id, row.photos);
    const warnings: ImportRowProblem[] = photos.failed
      ? [{ code: 'photos_not_downloaded', field: undefined, propertyId }]
      : [];
    return { changed: edited.changed || photos.added > 0, warnings };
  }

  /** Completa la descripción, las coordenadas y los comentarios internos. Si cambió algo. */
  private fillGaps(property: Property, row: ApiImportedProperty): boolean {
    const now = this.deps.clock.now();
    const s = property.toSnapshot();
    let changed = false;
    if (s.description.trim() === '' && row.description !== undefined) {
      changed =
        expectOk(
          property.updateDescription(
            { portalTitle: row.portalTitle ?? s.portalTitle, description: row.description },
            now,
          ),
        ) || changed;
    }
    if (s.coordinates === undefined && row.coordinates !== undefined) {
      changed =
        expectOk(
          property.updateLocation(
            {
              address: s.address,
              publishAddress: s.publishAddress,
              locationId: s.locationId,
              coordinates: row.coordinates,
            },
            now,
          ),
        ) || changed;
    }
    const current = s.internal.internalComments ?? '';
    if (row.tokkoComments !== undefined && !current.includes(row.tokkoComments)) {
      const block = `${TOKKO_COMMENTS_HEADING}\n${row.tokkoComments}`;
      changed =
        expectOk(
          property.updateInternalInfo(
            {
              ...s.internal,
              internalComments: current.trim() === '' ? block : `${current.trim()}\n\n${block}`,
            },
            now,
          ),
        ) || changed;
    }
    return changed;
  }

  /**
   * Baja las fotos de Tokko y las suma a la galería vacía de la propiedad, con la portada y el
   * orden de Tokko. Si la galería ya no está vacía (alguien subió fotos mientras tanto), no agrega
   * nada. `failed`: alguna no se pudo bajar.
   */
  private async addPhotos(
    runner: Actor,
    propertyId: PropertyId,
    photos: readonly TokkoApiPhoto[],
  ): Promise<{ readonly added: number; readonly failed: boolean }> {
    if (photos.length === 0) return { added: 0, failed: false };
    const owner: MediaOwner = { kind: 'property', id: propertyId };
    const stored: StoredPhoto[] = [];
    let failed = false;
    for (let i = 0; i < photos.length; i += PARALLEL_DOWNLOADS) {
      const batch = photos.slice(i, i + PARALLEL_DOWNLOADS);
      const downloads = await Promise.all(batch.map((photo) => this.download(photo)));
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
        const property = await tx.properties.findById(propertyId);
        if (!property || property.isDeleted || (await tx.media.count(owner)) > 0) return 0;
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
  private async download(photo: TokkoApiPhoto): Promise<DownloadedPhoto | undefined> {
    const source = this.deps.source;
    if (!source) return undefined;
    for (const url of [photo.url, photo.fallbackUrl]) {
      if (url === undefined) continue;
      const downloaded = await source.photo(url);
      if (downloaded.isErr()) continue;
      const valid = MediaItem.validateUpload({
        contentType: downloaded.value.contentType,
        sizeBytes: downloaded.value.bytes.byteLength,
      });
      if (valid.isOk()) return downloaded.value;
    }
    return undefined;
  }

  private async fail(
    job: PropertyImport,
    runner: Actor,
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunTokkoApiPropertyImportError>> {
    await this.deps.uow.run(async (tx) => {
      job.fail('source_unavailable', this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.failed', job.id), {
          status: { before: 'running', after: 'failed' },
          failure: { before: null, after: 'source_unavailable' },
        }),
      );
    });
    return ok({ status: job.status });
  }
}
