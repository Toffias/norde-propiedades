import {
  auditAction,
  auditCreated,
  diffChanges,
  nextId,
  parseId,
  type Actor,
  type Clock,
  type IdGenerator,
} from '../../shared';
import { Development, EMPTY_DEVELOPMENT_DEAL } from '../domain/development';
import type { PropertyImportRowOutcome } from '../domain/property-import';
import { sameDevelopmentName } from '../domain/tokko-property';

import type { ApiImportedDevelopment } from './development-api-import-row';
import {
  developmentAuditState,
  developmentCreatedState,
  developmentTarget,
} from './development-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from './ports/properties-transaction';
import type { PropertyImportDirectory } from './ports/property-import-directory';
import type { TokkoPhotoImporter } from './tokko-photo-importer';
import {
  expectOk,
  type ImportRowProblem,
  type RowProducer,
  type TokkoPropertyImporter,
} from './tokko-property-importer';

/** Qué pasó con un emprendimiento de Tokko y los problemas, con el emprendimiento si lo hay. */
export interface DevelopmentImportResult {
  readonly outcome: PropertyImportRowOutcome;
  readonly problems: readonly ImportRowProblem[];
}

/**
 * Los emprendimientos de la API de Tokko (decidido con Norde el 2026-10-20). Se buscan por el código
 * de Tokko y, si no hay, por el nombre (los que se cargaron a mano en Norde).
 *
 * - Si no existe, se crea con el código de Tokko, su ubicación del catalogo, el estado de obra, la
 *   entrega, la descripción, la financiación y las fotos: comercializando si estaba publicado en la
 *   web de Tokko, si no cargando información. El captador es el usuario a cargo en Tokko o, si no
 *   hay uno con ese nombre, quien pidió la importación.
 * - Si ya existe, se completa sin pisar nada: lo que esté vacío y las fotos si la galería está vacía.
 */
export class TokkoDevelopmentImporter {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly directory: PropertyImportDirectory;
      readonly properties: TokkoPropertyImporter;
      readonly photos: TokkoPhotoImporter;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async import(
    runner: Actor,
    row: ApiImportedDevelopment,
    fallback: RowProducer | undefined,
  ): Promise<DevelopmentImportResult> {
    const existing = await this.#find(row);
    if (existing?.isDeleted) {
      return {
        outcome: 'failed',
        problems: [{ code: 'code_in_trash', field: 'code', propertyId: existing.id }],
      };
    }
    if (existing) return this.#complete(runner, existing.id, row);
    return this.#create(runner, row, fallback);
  }

  /** El de ese código o, si no hay, el único con ese nombre (también de la papelera). */
  async #find(row: ApiImportedDevelopment): Promise<Development | undefined> {
    const byCode = await this.deps.uow.run((tx) => tx.developments.findByCode(row.code));
    if (byCode) return byCode;
    const matches = (await this.deps.directory.searchDevelopments(row.name)).filter((candidate) =>
      sameDevelopmentName(candidate.name, row.name),
    );
    const [match] = matches;
    if (matches.length !== 1 || !match) return undefined;
    const id = parseId<'Development'>(match.id);
    return id.isOk() ? this.deps.uow.run((tx) => tx.developments.findById(id.value)) : undefined;
  }

  async #create(
    runner: Actor,
    row: ApiImportedDevelopment,
    fallback: RowProducer | undefined,
  ): Promise<DevelopmentImportResult> {
    if (!row.place.inCatalog) {
      return { outcome: 'failed', problems: [{ code: 'location_not_found', field: 'region' }] };
    }
    const producer =
      (row.producerName === undefined
        ? undefined
        : await this.deps.properties.findProducer(row.producerName)) ?? fallback;
    const id = nextId<'Development'>(this.deps.ids);
    const created = await this.deps.uow.run(async (tx) => {
      const place = await this.deps.properties.resolvePlace(tx, runner, row.place);
      if (place.locationId === undefined) return false;
      const now = this.deps.clock.now();
      const development = Development.create({
        id,
        code: row.code,
        name: row.name,
        kind: row.kind,
        privateAddress: row.privateAddress,
        publishAddress: undefined,
        portalTitle: row.portalTitle,
        developerName: undefined,
        commercialContactClientId: undefined,
        locationId: place.locationId,
        coordinates: row.coordinates,
        producerUserId: producer?.userId,
        branchId: producer?.branchId,
        now,
      });
      // Recién creado no está en la papelera, y "cargando" pasa a "comercializando".
      expectOk(
        development.updateDetails(
          {
            constructionStatus: row.constructionStatus,
            deliveryDate: row.deliveryDate,
            description: row.description ?? '',
            financingDetails: row.financingDetails,
            deal: EMPTY_DEVELOPMENT_DEAL,
          },
          now,
        ),
      );
      if (row.status === 'marketing') expectOk(development.changeStatus('marketing', now));
      await tx.developments.save(development, runner.id);
      await tx.events.publish(development.pullEvents());
      await tx.audit.record(
        auditCreated(runner, developmentTarget('development.imported', development), {
          ...developmentCreatedState(development),
          constructionStatus: development.toSnapshot().constructionStatus,
          deliveryDate: development.toSnapshot().deliveryDate,
        }),
      );
      return true;
    });
    if (!created) {
      return { outcome: 'failed', problems: [{ code: 'location_not_found', field: 'region' }] };
    }
    const problems: ImportRowProblem[] = row.warnings.map((w) => ({ ...w, propertyId: id }));
    const photos = await this.deps.photos.add(runner, { kind: 'development', id }, row.photos);
    if (photos.failed) {
      problems.push({ code: 'photos_not_downloaded', field: undefined, propertyId: id });
    }
    return { outcome: 'created', problems };
  }

  /** Completa lo que está vacío y, si la galería está vacía, trae las fotos. */
  async #complete(
    runner: Actor,
    id: Development['id'],
    row: ApiImportedDevelopment,
  ): Promise<DevelopmentImportResult> {
    const edited = await this.deps.uow.run(async (tx) => {
      const development = await tx.developments.findById(id);
      if (!development || development.isDeleted) return { changed: false, galleryEmpty: false };
      const before = developmentAuditState(development);
      const changed = this.#fillGaps(development, row);
      if (changed) {
        await tx.developments.save(development, runner.id);
        await tx.events.publish(development.pullEvents());
        await tx.audit.record(
          auditAction(
            runner,
            developmentTarget('development.import_completed', development),
            diffChanges(before, developmentAuditState(development)),
          ),
        );
      }
      return { changed, galleryEmpty: await this.#galleryIsEmpty(tx, id) };
    });
    const problems: ImportRowProblem[] = [];
    let added = 0;
    if (edited.galleryEmpty && row.photos.length > 0) {
      const photos = await this.deps.photos.add(runner, { kind: 'development', id }, row.photos);
      added = photos.added;
      if (photos.failed) {
        problems.push({ code: 'photos_not_downloaded', field: undefined, propertyId: id });
      }
    }
    if (edited.changed || added > 0) return { outcome: 'completed', problems };
    return {
      outcome: 'existing',
      problems: [...problems, { code: 'already_imported', field: 'code', propertyId: id }],
    };
  }

  #galleryIsEmpty(tx: PropertiesTransaction, id: Development['id']): Promise<boolean> {
    return this.deps.photos.galleryIsEmpty(tx, { kind: 'development', id });
  }

  /** La descripción, la financiación, el estado de obra, la entrega y las coordenadas que falten. */
  #fillGaps(development: Development, row: ApiImportedDevelopment): boolean {
    const now = this.deps.clock.now();
    const s = development.toSnapshot();
    const details = expectOk(
      development.updateDetails(
        {
          constructionStatus: s.constructionStatus ?? row.constructionStatus,
          deliveryDate: s.deliveryDate ?? row.deliveryDate,
          description: s.description.trim() === '' ? (row.description ?? '') : s.description,
          financingDetails: s.financingDetails ?? row.financingDetails,
          deal: s.deal,
        },
        now,
      ),
    );
    const location =
      s.coordinates === undefined && row.coordinates !== undefined && s.locationId !== undefined
        ? expectOk(
            development.updateLocation(
              {
                privateAddress: s.privateAddress,
                publishAddress: s.publishAddress,
                locationId: s.locationId,
                coordinates: row.coordinates,
              },
              now,
            ),
          )
        : false;
    return details || location;
  }
}
