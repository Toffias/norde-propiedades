import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type AuditChanges,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  MergeClientsInputSchema,
  type MergeClientsInput,
  type MergeClientsOutput,
} from '../../contracts';
import type { Client, ClientInTrashError, SameClientError } from '../../domain/client';
import { mergeActivity } from '../../domain/client-activity';
import {
  clientAuditState,
  findClient,
  invalidInput,
  masksOwnerContact,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientRecordCounts } from '../ports/client-linked-records';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type MergeClientsError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | ClientInTrashError | SameClientError;

/** Lo que se audita del contacto además de sus campos: etiquetas y relaciones, por ID. */
function mergeAuditState(client: Client) {
  return {
    ...clientAuditState(client),
    tagIds: client.tagIds.length === 0 ? undefined : [...client.tagIds].sort(),
    relations:
      client.relations.length === 0
        ? undefined
        : client.relations.map((r) => ({
            relatedClientId: r.relatedClientId,
            kind: r.kind,
            label: r.label ?? null,
          })),
  };
}

const RECORD_FIELDS: readonly (keyof ClientRecordCounts)[] = [
  'opportunities',
  'activities',
  'savedSearches',
  'featuredListings',
  'sharedListings',
  'inquiries',
  'incomingRelations',
];

/** Cuántos registros de cada tipo se movieron; los tipos sin movimientos no aparecen. */
function countChanges(moved: ClientRecordCounts): AuditChanges {
  const changes: Record<string, { before: null; after: number }> = {};
  for (const field of RECORD_FIELDS) {
    if (moved[field] > 0) changes[`moved.${field}`] = { before: null, after: moved[field] };
  }
  return changes;
}

/**
 * Unifica dos contactos duplicados: el principal se queda con todo (teléfonos, emails, canales,
 * tipos, etiquetas, relaciones, oportunidades, actividad, búsquedas, destacadas, envíos y
 * consultas) y el duplicado queda vacío en la papelera apuntando al principal.
 *
 * Pide `clients:merge` y poder editar los dos. Si alguno es propietario y el actor no ve sus
 * datos, no puede unificarlo: movería datos que no ve.
 */
export class MergeClients {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MergeClientsInput,
    actor: Actor,
  ): Promise<Result<MergeClientsOutput, MergeClientsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (!actor.can('clients:merge') || accessScope(actor, rule) === undefined) {
      return err({ type: 'Forbidden' });
    }

    const parsed = MergeClientsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<MergeClientsOutput, MergeClientsError>> => {
      const primary = await findClient(tx.clients, parsed.data.primaryId);
      const duplicate = await findClient(tx.clients, parsed.data.duplicateId);
      if (!primary || !duplicate) return err({ type: 'ClientNotFound' });
      for (const client of [primary, duplicate]) {
        if (
          !canActOn(actor, rule, client.ownership) ||
          masksOwnerContact(actor, client.toSnapshot().clientTypes)
        ) {
          return err({ type: 'Forbidden' });
        }
      }

      const primaryBefore = mergeAuditState(primary);
      const duplicateBefore = mergeAuditState(duplicate);
      const merged = primary.absorb(duplicate, actor.id, now);
      if (merged.isErr()) return err(merged.error);

      // Primero el duplicado: libera sus teléfonos y emails, que tienen índice único.
      await tx.clients.save(duplicate, actor.id);
      await tx.clients.save(primary, actor.id);
      const moved = await tx.records.moveAll(duplicate.id, primary.id, now);
      await tx.activities.add(
        mergeActivity({
          id: this.deps.ids.next(),
          clientId: primary.id,
          mergedClientId: duplicate.id,
          actorId: actor.id,
          now,
        }),
        actor.id,
      );
      await tx.events.publish([...primary.pullEvents(), ...duplicate.pullEvents()]);

      const clientIds = [primary.id, duplicate.id];
      await tx.audit.record(
        auditAction(
          actor,
          { action: 'client.merged', entityType: 'client', entityId: primary.id, clientIds },
          {
            mergedClientId: { before: null, after: duplicate.id },
            ...diffChanges(primaryBefore, mergeAuditState(primary)),
            ...countChanges(moved),
          },
        ),
      );
      await tx.audit.record(
        auditAction(
          actor,
          {
            action: 'client.merged_into',
            entityType: 'client',
            entityId: duplicate.id,
            clientIds,
          },
          {
            mergedIntoId: { before: null, after: primary.id },
            ...diffChanges(duplicateBefore, mergeAuditState(duplicate)),
          },
        ),
      );
      return ok({ clientId: primary.id, moved });
    });
  }
}
