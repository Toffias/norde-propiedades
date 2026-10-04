import {
  auditAction,
  err,
  MergedClientInputSchema,
  ok,
  type Actor,
  type ForbiddenError,
  type MergedClientInput,
  type Result,
} from '../../../shared';
import type { MovedClientLinks } from '../ports/property-client-merge';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';

export interface InvalidMergeInputError {
  readonly type: 'InvalidInput';
}

export type MoveMergedClientLinksError = ForbiddenError | InvalidMergeInputError;

/**
 * Reacción a `clients.clients_merged`: las reservas, los propietarios y el contacto comercial de
 * emprendimientos que apuntaban al duplicado pasan al contacto que queda, para no perderlos con la
 * unificación. Cada propiedad y emprendimiento afectado lo deja en su historial, con los dos IDs.
 * Idempotente: una segunda vez no encuentra nada que mover.
 */
export class MoveMergedClientLinks {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: MergedClientInput,
    actor: Actor,
  ): Promise<Result<MovedClientLinks, MoveMergedClientLinksError>> {
    if (!actor.can('properties:merge-client-data')) return err({ type: 'Forbidden' });
    const parsed = MergedClientInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientId, mergedClientId } = parsed.data;

    const moved = await this.deps.uow.run(async (tx) => {
      const links = await tx.clientMerge.moveClient(mergedClientId, clientId);
      const changes = { clientId: { before: mergedClientId, after: clientId } };
      const clientIds = [clientId, mergedClientId];
      for (const propertyId of links.propertyIds) {
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'property.client_merged',
              entityType: 'property',
              entityId: propertyId,
              clientIds,
            },
            changes,
          ),
        );
      }
      for (const developmentId of links.developmentIds) {
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'development.client_merged',
              entityType: 'development',
              entityId: developmentId,
              clientIds,
            },
            changes,
          ),
        );
      }
      return links;
    });
    return ok(moved);
  }
}
