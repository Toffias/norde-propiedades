import type { FileStorage } from '../../../settings';
import {
  auditAction,
  err,
  nextId,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '../../../shared';
import {
  StartDevelopmentUnitImportInputSchema,
  type StartDevelopmentUnitImportInput,
  type StartDevelopmentUnitImportOutput,
} from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import {
  DevelopmentUnitImport,
  type EmptyUnitImportFileError,
  type InvalidUnitImportMappingError,
  type TooManyUnitImportRowsError,
} from '../../domain/development-unit-import';
import {
  developmentTarget,
  loadDevelopmentForEdit,
  type DevelopmentNotFoundError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';
import { canImportUnits, unitImportKey } from '../unit-import-support';

export type StartDevelopmentUnitImportError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentInTrashError
  | UnreadableSpreadsheetError
  | InvalidUnitImportMappingError
  | EmptyUnitImportFileError
  | TooManyUnitImportRowsError;

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Pide la importación de unidades de un Excel con el mapeo de columnas elegido: guarda el archivo
 * y deja la importación pendiente; la procesa un job (`properties.unit_import_requested`). Pide
 * crear propiedades y poder editar el emprendimiento. Queda en el historial del emprendimiento.
 */
export class StartDevelopmentUnitImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: StartDevelopmentUnitImportInput,
    actor: Actor,
  ): Promise<Result<StartDevelopmentUnitImportOutput, StartDevelopmentUnitImportError>> {
    if (!canImportUnits(actor)) return err({ type: 'Forbidden' });
    const parsed = StartDevelopmentUnitImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const checked = await this.deps.uow.run(async (tx) => {
      const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
      if (loaded.isErr()) return err(loaded.error);
      if (loaded.value.isDeleted) return err({ type: 'DevelopmentInTrash' as const });
      return ok(undefined);
    });
    if (checked.isErr()) return err(checked.error);

    const sheet = await this.deps.reader.open(data.bytes);
    if (sheet.isErr()) return err(sheet.error);

    const now = this.deps.clock.now();
    const id = nextId<'DevelopmentUnitImport'>(this.deps.ids);
    const requested = DevelopmentUnitImport.request({
      id,
      developmentId: data.developmentId,
      fileName: data.fileName,
      storageKey: unitImportKey(id),
      mapping: data.mapping,
      columnCount: sheet.value.headers.length,
      rows: sheet.value.rowCount,
      canMarkAvailable: actor.can('properties:mark-available'),
      requestedBy: actor.id,
      now,
    });
    if (requested.isErr()) return err(requested.error);
    const job = requested.value;

    await this.deps.storage.put({
      key: job.storageKey,
      contentType: XLSX_CONTENT_TYPE,
      bytes: data.bytes,
    });
    try {
      const saved = await this.deps.uow.run(async (tx) => {
        // Se vuelve a cargar: el emprendimiento pudo ir a la papelera mientras se leía el archivo.
        const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
        if (loaded.isErr()) return err(loaded.error);
        if (loaded.value.isDeleted) return err({ type: 'DevelopmentInTrash' as const });
        await tx.unitImports.save(job, actor.id);
        await tx.events.publish(job.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            developmentTarget('development.units_import_requested', loaded.value),
            {
              importId: { before: null, after: id },
              fileName: { before: null, after: data.fileName },
              rows: { before: null, after: job.totals.rows },
              mapping: { before: null, after: toAuditValue(data.mapping) },
            },
          ),
        );
        return ok(undefined);
      });
      if (saved.isErr()) {
        await this.deps.storage.delete(job.storageKey);
        return err(saved.error);
      }
    } catch (error) {
      await this.deps.storage.delete(job.storageKey);
      throw error;
    }
    return ok({ importId: id });
  }
}
