import type { FileStorage } from '../../../settings';
import {
  auditAction,
  diffChanges,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { Property } from '../../domain/property';
import type {
  PropertyImport,
  PropertyImportRowOutcome,
  PropertyImportRowProblem,
  PropertyImportStatus,
} from '../../domain/property-import';
import { tokkoReferenceCode } from '../../domain/tokko-property';
import { readTokkoApiDevelopment } from '../development-api-import-row';
import { developmentTarget } from '../development-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyImportDirectory } from '../ports/property-import-directory';
import type {
  TokkoApiDevelopment,
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
import { TokkoDevelopmentImporter } from '../tokko-development-importer';
import { TokkoPhotoImporter } from '../tokko-photo-importer';
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

/** Lo que usa una corrida: el importador de propiedades guarda lo ya buscado en ella. */
interface Run {
  readonly runner: Actor;
  readonly job: PropertyImport;
  readonly fallback: RowProducer | undefined;
  readonly properties: TokkoPropertyImporter;
  readonly developments: TokkoDevelopmentImporter;
  readonly photos: TokkoPhotoImporter;
}

/**
 * El job de `properties.tokko_api_import_requested`: trae de la API de Tokko primero los
 * emprendimientos y después las propiedades, de a páginas y en el orden de Tokko (decidido con
 * Norde el 2026-10-20).
 *
 * - Lo que no existe se crea con las reglas de la exportación (ubicación, productor, propietarios),
 *   más el título, la descripción, las coordenadas y las fotos. Los emprendimientos van primero
 *   para que las unidades queden vinculadas en la misma corrida.
 * - Lo que ya existe se completa sin pisar nada: lo que esté vacío, los comentarios internos de
 *   Tokko si no están, el emprendimiento de una unidad suelta y las fotos si la galería está vacía.
 *
 * Las fotos se bajan de Tokko al storage y quedan "procesando" hasta que el job de siempre genera
 * sus variantes. Cada propiedad va en sus propias transacciones junto con el avance: si el job se
 * corta, retoma donde quedó (los emprendimientos, si no terminaron, se vuelven a recorrer: son
 * pocos), y volver a correrla no duplica nada. Si Tokko no responde, la importación queda fallida
 * con lo hecho hasta ahí.
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

    const properties = new TokkoPropertyImporter(this.deps);
    const photos = new TokkoPhotoImporter({ ...this.deps, source });
    const run: Run = {
      runner,
      job,
      fallback: await properties.requester(job.requestedBy),
      properties,
      photos,
      developments: new TokkoDevelopmentImporter({ ...this.deps, properties, photos }),
    };

    if (!job.developmentsDone) {
      const imported = await this.importDevelopments(run, source);
      if (!imported) return this.fail(job, runner);
    }

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
        await this.importProperty(run, offset, property);
      }
      if (page.value.properties.length === 0 || offset >= page.value.total) break;
    }

    await this.deps.uow.run(async (tx) => {
      const { totals } = job;
      job.finish(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.finished', job.id), {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: totals.created },
          existing: { before: null, after: totals.existing },
          completed: { before: null, after: totals.completed },
          failed: { before: null, after: totals.failed },
          developmentsCreated: { before: null, after: totals.developments.created },
          developmentsCompleted: { before: null, after: totals.developments.completed },
          developmentsFailed: { before: null, after: totals.developments.failed },
        }),
      );
    });
    return ok({ status: job.status });
  }

  /** Todos los emprendimientos de Tokko. `false` si Tokko no respondió. */
  private async importDevelopments(run: Run, source: TokkoPropertySource): Promise<boolean> {
    // Si un corte dejó la mitad, se vuelven a recorrer todos: los totales empiezan de nuevo.
    run.job.restartDevelopments(this.deps.clock.now());
    let offset = 0;
    for (;;) {
      const page = await source.developments(offset, PAGE_SIZE);
      if (page.isErr()) return false;
      for (const development of page.value.developments) {
        offset += 1;
        await this.importDevelopment(run, offset, development);
      }
      if (page.value.developments.length === 0 || offset >= page.value.total) break;
    }
    await this.deps.uow.run(async (tx) => {
      run.job.finishDevelopments(this.deps.clock.now());
      await tx.propertyImports.save(run.job, run.runner.id);
    });
    return true;
  }

  private async importDevelopment(
    run: Run,
    rowNumber: number,
    development: TokkoApiDevelopment,
  ): Promise<void> {
    let reference: string | undefined = tokkoReferenceCode(development.referenceCode) || undefined;
    let outcome: PropertyImportRowOutcome = 'failed';
    let problems: readonly ImportRowProblem[];
    const read = readTokkoApiDevelopment(development);
    if (read.isErr()) {
      problems = [read.error];
    } else {
      reference = read.value.code;
      const result = await run.developments.import(run.runner, read.value, run.fallback);
      outcome = result.outcome;
      problems = result.problems;
    }
    await this.deps.uow.run(async (tx) => {
      await this.addProblems(tx, run.job, problems, { rowNumber, reference }, 'development');
      run.job.recordDevelopment(outcome, this.deps.clock.now());
      await tx.propertyImports.save(run.job, run.runner.id);
    });
  }

  private async importProperty(
    run: Run,
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
      const blocked = await this.deps.uow.run((tx) => run.properties.check(tx, row));
      if (blocked?.code === 'already_imported' && blocked.propertyId !== undefined) {
        const completed = await this.complete(run, blocked.propertyId, row);
        problems.push(...completed.warnings);
        outcome = completed.changed ? 'completed' : 'existing';
        // Una que ya estaba completa se informa como en la exportación.
        if (!completed.changed) problems.push(blocked);
      } else if (blocked) {
        problems.push(blocked);
      } else {
        const created = await run.properties.create(run.runner, row, run.fallback);
        problems.push(...created.warnings);
        const photos = await run.photos.add(
          run.runner,
          { kind: 'property', id: created.propertyId },
          row.photos,
        );
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
      await this.addProblems(tx, run.job, problems, { rowNumber, reference }, 'property');
      run.job.recordRow(outcome, this.deps.clock.now());
      await tx.propertyImports.save(run.job, run.runner.id);
    });
  }

  private async addProblems(
    tx: PropertiesTransaction,
    job: PropertyImport,
    problems: readonly ImportRowProblem[],
    row: Pick<PropertyImportRowProblem, 'rowNumber' | 'reference'>,
    subject: 'property' | 'development',
  ): Promise<void> {
    for (const problem of problems) {
      await tx.propertyImports.addProblem(
        job.id,
        {
          ...row,
          code: problem.code,
          field: problem.field,
          propertyId: problem.propertyId,
          subject,
        },
        this.deps.clock.now(),
      );
    }
  }

  /**
   * Le agrega a una propiedad que ya estaba lo que no tiene: descripción, coordenadas, los
   * comentarios de Tokko, su emprendimiento si es una unidad suelta, sus propietarios si no tiene
   * ninguno y las fotos. Lo cargado en Norde no se pisa.
   */
  private async complete(
    run: Run,
    propertyId: string,
    row: ApiImportedProperty,
  ): Promise<{ readonly changed: boolean; readonly warnings: readonly ImportRowProblem[] }> {
    const id = expectOk(parseId<'Property'>(propertyId));
    const developmentId = await run.properties.findDevelopment(row);
    const owners = await this.missingOwners(run, id, row);
    const warnings: ImportRowProblem[] = owners.unlinked
      ? [{ code: 'owner_not_linked', field: 'ownerPhone', propertyId }]
      : [];
    const edited = await this.deps.uow.run(async (tx) => {
      const property = await tx.properties.findById(id);
      if (!property || property.isDeleted) return { changed: false, galleryEmpty: false };
      const before = propertyDetailAuditState(property);
      const changed = this.fillGaps(property, row);
      const joined = await this.joinDevelopment(tx, run.runner, property, developmentId);
      const linked = await this.linkOwners(tx, run.runner, property, owners.clientIds);
      if (changed || joined) {
        await saveEdit(
          tx,
          property,
          run.runner,
          auditAction(
            run.runner,
            propertyTarget('property.import_completed', property.id),
            diffChanges(before, propertyDetailAuditState(property)),
          ),
        );
      }
      const galleryEmpty = await run.photos.galleryIsEmpty(tx, { kind: 'property', id });
      return { changed: changed || joined || linked, galleryEmpty };
    });
    if (!edited.galleryEmpty || row.photos.length === 0) {
      return { changed: edited.changed, warnings };
    }
    const photos = await run.photos.add(run.runner, { kind: 'property', id }, row.photos);
    if (photos.failed) {
      warnings.push({ code: 'photos_not_downloaded', field: undefined, propertyId });
    }
    return { changed: edited.changed || photos.added > 0, warnings };
  }

  /**
   * Los contactos de los propietarios de Tokko, si la propiedad no tiene ninguno: se buscan o se
   * crean afuera de su transacción, a cargo de su productor.
   */
  private async missingOwners(
    run: Run,
    id: Property['id'],
    row: ApiImportedProperty,
  ): Promise<{ readonly clientIds: readonly string[]; readonly unlinked: boolean }> {
    if (row.owners.length === 0) return { clientIds: [], unlinked: false };
    const property = await this.deps.uow.run(async (tx) =>
      (await tx.owners.hasAny(id)) ? undefined : tx.properties.findById(id),
    );
    if (!property || property.isDeleted) return { clientIds: [], unlinked: false };
    const producerUserId = property.producerUserId;
    return run.properties.findOwners(
      run.runner,
      row,
      producerUserId === undefined ? undefined : { userId: producerUserId, branchId: undefined },
    );
  }

  /** Los vincula como propietarios, con su ID en `client_ids` para la supresión. */
  private async linkOwners(
    tx: PropertiesTransaction,
    runner: Actor,
    property: Property,
    clientIds: readonly string[],
  ): Promise<boolean> {
    if (clientIds.length === 0 || (await tx.owners.hasAny(property.id))) return false;
    for (const clientId of clientIds) await tx.owners.add(property.id, clientId, runner.id);
    await tx.audit.record(
      auditAction(
        runner,
        { ...propertyTarget('property.owners_imported', property.id), clientIds: [...clientIds] },
        diffChanges({}, { ownerClientIds: [...clientIds] }),
      ),
    );
    return true;
  }

  /**
   * Si la propiedad está suelta y en Tokko es unidad de un emprendimiento que está en Norde, la
   * suma como su unidad (también en el historial del emprendimiento).
   */
  private async joinDevelopment(
    tx: PropertiesTransaction,
    runner: Actor,
    property: Property,
    developmentId: string | undefined,
  ): Promise<boolean> {
    if (developmentId === undefined || property.developmentId !== undefined) return false;
    const id = parseId<'Development'>(developmentId);
    const development = id.isOk() ? await tx.developments.findById(id.value) : undefined;
    if (!development || development.isDeleted) return false;
    const joined = expectOk(property.joinDevelopment(development.id, this.deps.clock.now()));
    if (joined) {
      await tx.audit.record(
        auditAction(
          runner,
          developmentTarget('development.unit_added', development),
          diffChanges({}, { unitId: property.id, unitCode: property.code }),
        ),
      );
    }
    return joined;
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
