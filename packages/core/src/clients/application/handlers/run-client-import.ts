import type { FileStorage } from '../../../settings';
import {
  type Actor,
  auditAction,
  type Clock,
  err,
  type ForbiddenError,
  type IdGenerator,
  nextId,
  ok,
  parseId,
  type Result,
  type SpreadsheetReader,
  type SpreadsheetRow,
} from '../../../shared';
import {
  MAX_IMPORT_ROWS,
  type ClientImport,
  type ClientImportFailure,
  type ClientImportStatus,
  type ImportField,
  type ImportProblemCode,
  type ImportRowOutcome,
} from '../../domain/client-import';
import { createClientIn } from '../client-creation';
import { readImportRow } from '../client-import-row';
import { importTarget } from '../import-support';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';

export interface ClientImportNotFoundError {
  readonly type: 'ClientImportNotFound';
}

export interface InvalidImportIdError {
  readonly type: 'InvalidInput';
}

export type RunClientImportError =
  ForbiddenError | InvalidImportIdError | ClientImportNotFoundError;

/**
 * El job de `clients.import_requested`: lee el Excel guardado y da de alta cada fila con la misma
 * regla de duplicados que el alta manual. Cada fila va en su propia transacción junto con el
 * avance, así un corte retoma donde quedó y una reentrega de una importación terminada no hace
 * nada. Los contactos quedan auditados como `system:import`, agrupados por la importación. Al
 * terminar se borra el archivo, que tiene datos personales.
 */
export class RunClientImport {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: { readonly importId: string },
    actor: Actor,
  ): Promise<Result<{ readonly status: ClientImportStatus }, RunClientImportError>> {
    if (!actor.can('clients:run-imports')) return err({ type: 'Forbidden' });
    const id = parseId<'ClientImport'>(input.importId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const job = await this.deps.uow.run((tx) => tx.imports.findById(id.value));
    if (!job) return err({ type: 'ClientImportNotFound' });
    if (job.isFinished) return ok({ status: job.status });
    const runner = actor.withCorrelation(job.id);

    await this.deps.uow.run(async (tx) => {
      job.start(this.deps.clock.now());
      await tx.imports.save(job, actor.id);
    });

    const stored = await this.deps.storage.get(job.storageKey);
    if (!stored) return this.fail(job, 'file_missing', runner);
    const sheet = await this.deps.reader.open(stored.bytes);
    if (sheet.isErr()) return this.fail(job, 'unreadable_file', runner);
    if (sheet.value.rowCount > MAX_IMPORT_ROWS) return this.fail(job, 'too_many_rows', runner);

    let index = 0;
    for await (const row of sheet.value.rows()) {
      const rowIndex = index;
      index += 1;
      if (job.wasProcessed(rowIndex)) continue;
      await this.deps.uow.run(async (tx) => {
        const outcome = await this.importRow(tx, runner, job, row);
        job.recordRow(outcome, this.deps.clock.now());
        await tx.imports.save(job, actor.id);
      });
    }

    await this.deps.uow.run(async (tx) => {
      job.finish(this.deps.clock.now());
      await tx.imports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, importTarget('client_import.finished', job.id), {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: job.totals.created },
          duplicates: { before: null, after: job.totals.duplicates },
          failed: { before: null, after: job.totals.failed },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }

  private async importRow(
    tx: ClientsTransaction,
    runner: Actor,
    job: ClientImport,
    row: SpreadsheetRow,
  ): Promise<ImportRowOutcome> {
    const problem = (code: ImportProblemCode, field: ImportField | undefined, clientId?: string) =>
      tx.imports.addProblem(
        job.id,
        { rowNumber: row.rowNumber, code, field, clientId },
        this.deps.clock.now(),
      );

    const read = readImportRow(row.cells, job.mapping);
    if (read.isErr()) {
      await problem(read.error.code, read.error.field);
      return 'failed';
    }
    const created = await createClientIn(tx, runner, {
      ...read.value,
      id: nextId<'Client'>(this.deps.ids),
      agentId: job.agentId,
      branchId: job.branchId,
      now: this.deps.clock.now(),
    });
    if (created.isOk()) return 'created';
    switch (created.error.type) {
      case 'DuplicateClient':
        await problem('duplicate', undefined, created.error.clientId);
        return 'duplicate';
      case 'MissingName':
        await problem('missing_name', undefined);
        return 'failed';
      case 'MissingContactInfo':
        await problem('missing_contact', undefined);
        return 'failed';
    }
  }

  private async fail(
    job: ClientImport,
    failure: ClientImportFailure,
    runner: Actor,
  ): Promise<Result<{ readonly status: ClientImportStatus }, RunClientImportError>> {
    await this.deps.uow.run(async (tx) => {
      job.fail(failure, this.deps.clock.now());
      await tx.imports.save(job, runner.id);
      await tx.audit.record(
        auditAction(runner, importTarget('client_import.failed', job.id), {
          status: { before: 'running', after: 'failed' },
          failure: { before: null, after: failure },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }
}
