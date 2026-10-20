import type { FileStorage } from '../../../settings';
import {
  type Actor,
  auditAction,
  auditCreated,
  auditUpdated,
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
  toAuditValue,
} from '../../../shared';
import type { Client } from '../../domain/client';
import {
  MAX_IMPORT_ROWS,
  type ClientImport,
  type ClientImportFailure,
  type ClientImportStatus,
  type ImportField,
  type ImportProblemCode,
  type ImportRowOutcome,
} from '../../domain/client-import';
import { ClientTag } from '../../domain/client-tag';
import { Opportunity } from '../../domain/opportunity';
import { closingStatusFor, OpportunityCloseReason } from '../../domain/opportunity-close-reason';
import { firstActiveStageOf } from '../../domain/opportunity-stage';
import { tokkoOpportunityType, type CloseReasonTarget } from '../../domain/tokko-opportunity';
import { normalizeName } from '../../domain/duplicate-check';
import { createClientIn } from '../client-creation';
import {
  readImportExtras,
  readImportOpportunity,
  readImportRow,
  type ImportedOpportunity,
} from '../client-import-row';
import { clientTarget } from '../client-support';
import { importTarget } from '../import-support';
import type { ClientImportAgents } from '../ports/client-import-agents';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import { closeReasonAuditState, configTarget } from '../opportunity-config-support';
import { opportunityAuditState, opportunityTarget } from '../opportunity-support';
import { clientTagAuditState, tagCatalogTarget } from '../tag-support';

export interface ClientImportNotFoundError {
  readonly type: 'ClientImportNotFound';
}

export interface InvalidImportIdError {
  readonly type: 'InvalidInput';
}

export type RunClientImportError =
  ForbiddenError | InvalidImportIdError | ClientImportNotFoundError;

/** El agente de la columna "Agente": el usuario activo con ese nombre, con su sucursal. */
/** `AAAA-MM-DD` de Buenos Aires (UTC-3, sin horario de verano): comienzo del día en UTC. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

interface RowAgent {
  readonly agentId: string;
  readonly branchId: string | undefined;
}

/**
 * El job de `clients.import_requested`: lee la planilla guardada y da de alta cada fila con la
 * misma regla de duplicados que el alta manual. Cada fila va en su propia transacción junto con el
 * avance, así un corte retoma donde quedó y una reentrega de una importación terminada no hace
 * nada. Los contactos quedan auditados como `system:import`, agrupados por la importación. Al
 * terminar se borra el archivo, que tiene datos personales.
 *
 * Con la columna del ID de Tokko, una fila que ya se importó (o cuyo contacto pidió la supresión)
 * no se vuelve a crear, y un duplicado queda vinculado a ese ID. Con la del agente, el contacto
 * queda a cargo del usuario activo con ese nombre (si no hay uno, del agente de la importación).
 * Las etiquetas se buscan por nombre entre las sueltas y se crean las que faltan.
 *
 * Con la columna del estado de la oportunidad, cada contacto creado lleva la suya, ya en su estado
 * (`Opportunity.imported`), con el motivo de cierre traducido (los que faltan se crean) y las
 * fechas de Tokko.
 */
export class RunClientImport {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly agents: ClientImportAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  /** Los agentes ya buscados en esta corrida, por nombre normalizado (`null`: no hay uno). */
  readonly #agents = new Map<string, RowAgent | null>();

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
    const extras = readImportExtras(row.cells, job.mapping);
    if (extras.isErr()) {
      await problem(extras.error.code, extras.error.field);
      return 'failed';
    }
    const { externalId, agentName, tagNames } = extras.value;
    const opportunity = readImportOpportunity(row.cells, job.mapping);
    if (opportunity.isErr()) {
      await problem(opportunity.error.code, opportunity.error.field);
      return 'failed';
    }

    if (externalId !== undefined) {
      const known = await tx.externalIds.find('tokko', externalId);
      if (known?.erased) {
        await problem('erased', 'externalId');
        return 'failed';
      }
      if (known) {
        await problem('already_imported', 'externalId', known.clientId);
        return 'duplicate';
      }
    }

    const now = this.deps.clock.now();
    const agent = (agentName === undefined ? undefined : await this.findAgent(agentName)) ?? {
      agentId: job.agentId,
      branchId: job.branchId,
    };
    const created = await createClientIn(tx, runner, {
      ...read.value,
      id: nextId<'Client'>(this.deps.ids),
      agentId: agent.agentId,
      branchId: agent.branchId,
      now,
    });
    if (created.isOk()) {
      if (externalId !== undefined) {
        await tx.externalIds.link({ source: 'tokko', externalId, clientId: created.value.id, now });
      }
      await this.tagClient(tx, runner, created.value, tagNames);
      if (opportunity.value) {
        await this.importOpportunity(tx, runner, created.value, opportunity.value, tagNames);
      }
      return 'created';
    }
    switch (created.error.type) {
      case 'DuplicateClient':
        // Es la misma persona: la próxima corrida la reconoce por su ID.
        if (externalId !== undefined) {
          await tx.externalIds.link({
            source: 'tokko',
            externalId,
            clientId: created.error.clientId,
            now,
          });
        }
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

  /** El usuario activo con ese nombre (sin distinguir mayúsculas ni acentos), si hay uno solo. */
  private async findAgent(name: string): Promise<RowAgent | undefined> {
    const key = normalizeName(name);
    const cached = this.#agents.get(key);
    if (cached !== undefined) return cached ?? undefined;
    const matches = (await this.deps.agents.searchByName(name)).filter(
      (candidate) => normalizeName(candidate.name) === key,
    );
    const [match] = matches;
    const agent =
      matches.length === 1 && match ? { agentId: match.userId, branchId: match.branchId } : null;
    this.#agents.set(key, agent);
    return agent ?? undefined;
  }

  /** Las etiquetas sueltas con esos nombres (las que faltan se crean), marcadas en el contacto. */
  private async tagClient(
    tx: ClientsTransaction,
    runner: Actor,
    client: Client,
    names: readonly string[],
  ): Promise<void> {
    if (names.length === 0) return;
    const now = this.deps.clock.now();
    const tagIds: string[] = [];
    for (const name of names) {
      const existing = await tx.tags.findInGroup(undefined, name);
      if (existing) {
        tagIds.push(existing.id);
        continue;
      }
      const tag = ClientTag.create({
        id: nextId<'ClientTag'>(this.deps.ids),
        groupId: undefined,
        name,
        now,
      });
      await tx.tags.save(tag, runner.id);
      await tx.audit.record(
        auditCreated(
          runner,
          tagCatalogTarget('client_tag', 'client_tag.created', tag.id),
          clientTagAuditState(tag),
        ),
      );
      tagIds.push(tag.id);
    }

    // Recién creado, el contacto no está en la papelera: el cambio no falla.
    client.changeTags(tagIds, now);
    const entry = auditUpdated(
      runner,
      clientTarget('client.tags_changed', client.id),
      { tagIds: toAuditValue([]) },
      { tagIds: toAuditValue([...client.tagIds].sort()) },
    );
    await tx.clients.save(client, runner.id);
    await tx.events.publish(client.pullEvents());
    if (entry) await tx.audit.record(entry);
  }

  /** La oportunidad de Tokko del contacto recién creado, en su estado y con sus fechas. */
  private async importOpportunity(
    tx: ClientsTransaction,
    runner: Actor,
    client: Client,
    data: ImportedOpportunity,
    tagNames: readonly string[],
  ): Promise<void> {
    const reason =
      data.closeReason && (await this.closeReason(tx, runner, data.closeReason.target));
    const category = data.state.closed
      ? closingStatusFor(data.closeReason?.target.rating ?? 'negative')
      : data.state.category;
    // Cada categoría conserva un estado activo (regla de OpportunityStage).
    const stage = firstActiveStageOf(await tx.stages.findAll(), category);
    if (!stage) throw new Error(`No active opportunity stage for ${category}`);

    const now = this.deps.clock.now();
    const createdAt = data.createdDate === undefined ? now : startOfDay(data.createdDate);
    const { ownerId, ownerBranchId } = client.ownership;
    const imported = Opportunity.imported({
      id: nextId<'Opportunity'>(this.deps.ids),
      clientId: client.id,
      originChannel: data.origin,
      type: tokkoOpportunityType(data.closeReason, tagNames),
      stage: stage.ref(),
      closeReason: reason?.ref(),
      agent: { agentId: ownerId, branchId: ownerBranchId },
      statusChangeId: nextId<'OpportunityStatusChange'>(this.deps.ids),
      note: data.closeReason?.note,
      createdAt,
      statusChangedAt: data.updatedDate === undefined ? createdAt : startOfDay(data.updatedDate),
    });
    // El estado sale de la calificación del motivo: no puede quedar inconsistente.
    if (imported.isErr())
      throw new Error(`Unexpected imported opportunity: ${imported.error.reason}`);
    const opportunity = imported.value;

    await tx.opportunities.save(opportunity, runner.id);
    await tx.events.publish(opportunity.pullEvents());
    await tx.audit.record(
      auditCreated(
        runner,
        opportunityTarget('opportunity.imported', opportunity),
        opportunityAuditState(opportunity),
      ),
    );
  }

  /** El motivo de cierre de Norde con ese nombre; si no hay, se crea (auditado). */
  private async closeReason(
    tx: ClientsTransaction,
    runner: Actor,
    target: CloseReasonTarget,
  ): Promise<OpportunityCloseReason> {
    const reasons = await tx.closeReasons.findAll();
    const key = normalizeName(target.name);
    const sameName = reasons.filter((r) => normalizeName(r.name) === key);
    const existing = sameName.find((r) => r.isActive) ?? sameName[0];
    if (existing) return existing;

    const created = OpportunityCloseReason.create({
      id: nextId<'OpportunityCloseReason'>(this.deps.ids),
      name: target.name,
      rating: target.rating,
      existingCount: reasons.length,
      now: this.deps.clock.now(),
    });
    // Tope de 50 motivos: la importación no puede seguir sin uno (se arregla en Mi empresa).
    if (created.isErr()) throw new Error(`Cannot create close reason: ${created.error.type}`);
    await tx.closeReasons.save(created.value, runner.id);
    await tx.audit.record(
      auditCreated(
        runner,
        configTarget(
          'opportunity_close_reason',
          'opportunity_close_reason.created',
          created.value.id,
        ),
        closeReasonAuditState(created.value),
      ),
    );
    return created.value;
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
