import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  ClientImportIdInputSchema,
  type ClientImportIdInput,
  type ClientImportRow,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientImportNotFoundError } from '../handlers/run-client-import';
import { toImportRows } from '../import-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientImportQuery } from '../ports/client-import-query';

export type GetClientImportError = ForbiddenError | InvalidInputError | ClientImportNotFoundError;

/** Una importación con su estado y sus totales (la pantalla la consulta mientras avanza). */
export class GetClientImport {
  constructor(
    private readonly deps: {
      readonly imports: ClientImportQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ClientImportIdInput,
    actor: Actor,
  ): Promise<Result<ClientImportRow, GetClientImportError>> {
    if (!actor.can('clients:import')) return err({ type: 'Forbidden' });
    const parsed = ClientImportIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const item = await this.deps.imports.find(parsed.data.importId);
    if (!item) return err({ type: 'ClientImportNotFound' });
    const [row] = await toImportRows(this.deps.agents, [item]);
    return row ? ok(row) : err({ type: 'ClientImportNotFound' });
  }
}
