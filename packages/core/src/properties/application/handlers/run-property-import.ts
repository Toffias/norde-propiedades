import type { FileStorage } from '../../../settings';
import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
  type SpreadsheetReader,
} from '../../../shared';
import {
  MAX_PROPERTY_IMPORT_ROWS,
  type PropertyImport,
  type PropertyImportFailure,
  type PropertyImportRowOutcome,
  type PropertyImportStatus,
} from '../../domain/property-import';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyImportDirectory } from '../ports/property-import-directory';
import type { Producers } from '../ports/user-names';
import { readPropertyImportRow } from '../property-import-row';
import { propertyImportTarget } from '../property-import-support';
import type { PropertyImportNotFoundError } from '../queries/get-property-import';
import {
  TokkoPropertyImporter,
  type ImportRowProblem,
  type RowProducer,
} from '../tokko-property-importer';

export interface InvalidPropertyImportIdError {
  readonly type: 'InvalidInput';
}

export type RunPropertyImportError =
  ForbiddenError | InvalidPropertyImportIdError | PropertyImportNotFoundError;

/**
 * El job de `properties.import_requested`: lee la exportación de Tokko guardada y crea una
 * propiedad por fila, disponible, con el "Ref" de Tokko como código. Una fila con un código que ya
 * existe no se vuelve a crear. Cada fila va en su propia transacción junto con el avance: si el job
 * se corta, retoma donde quedó.
 *
 * - La ubicación sale del catálogo: CABA con su barrio; el GBA y la costa con su partido. La
 *   localidad o el barrio que falta se crea. Otro país queda como texto.
 * - El productor es el usuario activo con ese nombre; si no hay uno, quien pidió la importación.
 * - El propietario se busca o se crea en contactos por su teléfono o email.
 * - Si hay un emprendimiento con ese nombre, la propiedad queda como su unidad.
 *
 * Lo creado queda auditado como `system:import`, agrupado por la importación. Al terminar se borra
 * el archivo, que tiene datos personales.
 */
export class RunPropertyImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reader: SpreadsheetReader;
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
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunPropertyImportError>> {
    if (!actor.can('properties:run-imports')) return err({ type: 'Forbidden' });
    const id = parseId<'PropertyImport'>(input.importId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const job = await this.deps.uow.run((tx) => tx.propertyImports.findById(id.value));
    if (!job) return err({ type: 'PropertyImportNotFound' });
    if (job.isFinished) return ok({ status: job.status });
    const runner = actor.withCorrelation(job.id);

    await this.deps.uow.run(async (tx) => {
      job.start(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
    });

    const stored = await this.deps.storage.get(job.storageKey);
    if (!stored) return this.fail(job, 'file_missing', runner);
    const sheet = await this.deps.reader.open(stored.bytes);
    if (sheet.isErr()) return this.fail(job, 'unreadable_file', runner);
    if (sheet.value.rowCount > MAX_PROPERTY_IMPORT_ROWS) {
      return this.fail(job, 'too_many_rows', runner);
    }

    const importer = new TokkoPropertyImporter(this.deps);
    const fallback = await importer.requester(job.requestedBy);
    let index = 0;
    for await (const row of sheet.value.rows()) {
      const rowIndex = index;
      index += 1;
      if (job.wasProcessed(rowIndex)) continue;
      await this.importRow(importer, runner, job, fallback, row.rowNumber, row.cells);
    }

    await this.deps.uow.run(async (tx) => {
      job.finish(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.finished', job.id), {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: job.totals.created },
          existing: { before: null, after: job.totals.existing },
          failed: { before: null, after: job.totals.failed },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }

  private async importRow(
    importer: TokkoPropertyImporter,
    runner: Actor,
    job: PropertyImport,
    fallback: RowProducer | undefined,
    rowNumber: number,
    cells: readonly (string | undefined)[],
  ): Promise<void> {
    const problems: ImportRowProblem[] = [];
    let outcome: PropertyImportRowOutcome = 'failed';

    const read = readPropertyImportRow(cells, job.columns);
    if (read.isErr()) {
      problems.push(read.error);
    } else {
      const row = read.value;
      const blocked = await this.deps.uow.run((tx) => importer.check(tx, row));
      if (blocked) {
        problems.push(blocked);
        if (blocked.code === 'already_imported') outcome = 'existing';
      } else {
        const created = await importer.create(runner, row, fallback);
        problems.push(...created.warnings);
        outcome = 'created';
      }
    }

    await this.deps.uow.run(async (tx) => {
      for (const problem of problems) {
        await tx.propertyImports.addProblem(
          job.id,
          { rowNumber, code: problem.code, field: problem.field, propertyId: problem.propertyId },
          this.deps.clock.now(),
        );
      }
      job.recordRow(outcome, this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
    });
  }

  private async fail(
    job: PropertyImport,
    failure: PropertyImportFailure,
    runner: Actor,
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunPropertyImportError>> {
    await this.deps.uow.run(async (tx) => {
      job.fail(failure, this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.failed', job.id), {
          status: { before: 'running', after: 'failed' },
          failure: { before: null, after: failure },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }
}
