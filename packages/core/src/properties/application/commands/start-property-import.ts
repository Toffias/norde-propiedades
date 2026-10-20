import type { FileStorage } from '../../../settings';
import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '../../../shared';
import {
  StartPropertyImportInputSchema,
  type StartPropertyImportInput,
  type StartPropertyImportOutput,
} from '../../contracts';
import {
  PropertyImport,
  type EmptyPropertyImportFileError,
  type NotATokkoExportError,
  type TooManyPropertyImportRowsError,
} from '../../domain/property-import';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canImportProperties,
  propertyImportKey,
  propertyImportTarget,
} from '../property-import-support';
import { invalidInput, type InvalidInputError } from '../property-support';

export type StartPropertyImportError =
  | ForbiddenError
  | InvalidInputError
  | UnreadableSpreadsheetError
  | NotATokkoExportError
  | EmptyPropertyImportFileError
  | TooManyPropertyImportRowsError;

/** Puede ser `.csv`, `.xlsx` o `.xls`: el lector lo reconoce por su contenido. */
const UPLOAD_CONTENT_TYPE = 'application/octet-stream';

/**
 * Pide la importación de la exportación de propiedades de Tokko: guarda el archivo y deja la
 * importación pendiente; la procesa un job (`properties.import_requested`).
 */
export class StartPropertyImport {
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
    input: StartPropertyImportInput,
    actor: Actor,
  ): Promise<Result<StartPropertyImportOutput, StartPropertyImportError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = StartPropertyImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const sheet = await this.deps.reader.open(data.bytes);
    if (sheet.isErr()) return err(sheet.error);

    const now = this.deps.clock.now();
    const id = nextId<'PropertyImport'>(this.deps.ids);
    const requested = PropertyImport.request({
      id,
      fileName: data.fileName,
      storageKey: propertyImportKey(id),
      headers: sheet.value.headers,
      rows: sheet.value.rowCount,
      requestedBy: actor.id,
      now,
    });
    if (requested.isErr()) return err(requested.error);
    const job = requested.value;

    await this.deps.storage.put({
      key: job.storageKey,
      contentType: UPLOAD_CONTENT_TYPE,
      bytes: data.bytes,
    });
    try {
      await this.deps.uow.run(async (tx) => {
        await tx.propertyImports.save(job, actor.id);
        await tx.events.publish(job.pullEvents());
        await tx.audit.record(
          auditCreated(actor, propertyImportTarget('property_import.requested', id), {
            fileName: data.fileName,
            rows: job.totals.rows,
          }),
        );
      });
    } catch (error) {
      await this.deps.storage.delete(job.storageKey);
      throw error;
    }
    return ok({ importId: id });
  }
}
