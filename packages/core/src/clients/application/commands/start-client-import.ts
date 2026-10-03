import type { FileStorage } from '../../../settings';
import {
  type Actor,
  auditCreated,
  type Clock,
  err,
  type ForbiddenError,
  type IdGenerator,
  nextId,
  ok,
  type Result,
  type SpreadsheetReader,
  toAuditValue,
  type UnreadableSpreadsheetError,
} from '../../../shared';
import {
  StartClientImportInputSchema,
  type StartClientImportInput,
  type StartClientImportOutput,
} from '../../contracts';
import {
  ClientImport,
  type EmptyImportFileError,
  type InvalidImportMappingError,
  type TooManyImportRowsError,
} from '../../domain/client-import';
import {
  invalidInput,
  resolveAgent,
  type AgentNotFoundError,
  type InvalidInputError,
} from '../client-support';
import { clientImportKey, importTarget } from '../import-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type StartClientImportError =
  | ForbiddenError
  | InvalidInputError
  | UnreadableSpreadsheetError
  | InvalidImportMappingError
  | EmptyImportFileError
  | TooManyImportRowsError
  | AgentNotFoundError;

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Pide la importación de un Excel con el mapeo de columnas elegido: guarda el archivo y deja la
 * importación pendiente; la procesa un job (`clients.import_requested`). Los contactos quedan a
 * cargo de quien importa, o del agente elegido con `clients:reassign`.
 */
export class StartClientImport {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: StartClientImportInput,
    actor: Actor,
  ): Promise<Result<StartClientImportOutput, StartClientImportError>> {
    if (!actor.can('clients:import')) return err({ type: 'Forbidden' });
    const parsed = StartClientImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const agentId = data.agentId ?? (actor.kind === 'user' ? actor.id : undefined);
    if (agentId !== actor.id && agentId !== undefined && !actor.can('clients:reassign')) {
      return err({ type: 'Forbidden' });
    }
    const agent = await resolveAgent(this.deps.agents, agentId);
    if (agent.isErr()) return err(agent.error);

    const sheet = await this.deps.reader.open(data.bytes);
    if (sheet.isErr()) return err(sheet.error);

    const now = this.deps.clock.now();
    const id = nextId<'ClientImport'>(this.deps.ids);
    const requested = ClientImport.request({
      id,
      fileName: data.fileName,
      storageKey: clientImportKey(id),
      mapping: data.mapping,
      columnCount: sheet.value.headers.length,
      rows: sheet.value.rowCount,
      agentId: agent.value.agentId,
      branchId: agent.value.branchId,
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
      await this.deps.uow.run(async (tx) => {
        await tx.imports.save(job, actor.id);
        await tx.events.publish(job.pullEvents());
        await tx.audit.record(
          auditCreated(actor, importTarget('client_import.requested', id), {
            fileName: data.fileName,
            rows: job.totals.rows,
            agentId: agent.value.agentId,
            mapping: toAuditValue(data.mapping),
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
