import {
  auditAction,
  auditUpdated,
  diffChanges,
  err,
  ok,
  type Actor,
  type AuditEntry,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import type { z } from 'zod';

import {
  BulkEditPropertiesInputSchema,
  type BulkEditChangeSchema,
  MAX_BULK_EDIT,
  type BulkEditPropertiesInput,
  type BulkEditResult,
  type BulkSkipReason,
} from '../../contracts';
import type { Property } from '../../domain/property';
import type { TagNotFoundError } from '../catalog-support';
import { resolveSelection, type NoBranchAssignedError } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import { findProperty, propertyTarget, type InvalidInputError } from '../property-support';

export type BulkEditPropertiesError =
  | ForbiddenError
  | InvalidInputError
  | NoBranchAssignedError
  | TagNotFoundError
  | { readonly type: 'ProducerNotFound' }
  | { readonly type: 'TooManyProperties'; readonly max: number; readonly total: number };

type Change = z.output<typeof BulkEditChangeSchema>;

/** Cada lote corre en su transacción: un error en uno no deshace los anteriores. */
const BATCH_SIZE = 100;
/** El detalle de las que no se pudieron cambiar se corta acá; el total sí se informa. */
const MAX_SKIPPED_DETAIL = 20;

/**
 * Edición rápida masiva: precio, estado, captador o etiquetas de las propiedades seleccionadas (las
 * marcadas o todas las que cumplen el filtro). Hace falta `properties:bulk-edit`, y sobre cada
 * propiedad, poder editarla (las propias, las de la sucursal o todas). Las que no se pueden cambiar
 * se saltean y se informan; cada cambio queda en el historial de su propiedad.
 */
export class BulkEditProperties {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly list: PanelPropertyListQuery;
      readonly producers: Producers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: BulkEditPropertiesInput,
    actor: Actor,
  ): Promise<Result<BulkEditResult, BulkEditPropertiesError>> {
    if (!actor.can('properties:bulk-edit')) return err({ type: 'Forbidden' });

    const parsed = BulkEditPropertiesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { selection, change } = parsed.data;
    if (change.field === 'producer' && !actor.can('properties:change-producer')) {
      return err({ type: 'Forbidden' });
    }
    if (
      change.field === 'status' &&
      change.status === 'available' &&
      !actor.can('properties:mark-available')
    ) {
      return err({ type: 'Forbidden' });
    }

    const criteria = resolveSelection(selection, actor);
    if (criteria.isErr()) return err(criteria.error);
    const total =
      selection.kind === 'ids' ? selection.ids.length : await this.deps.list.count(criteria.value);
    if (total > MAX_BULK_EDIT) {
      return err({ type: 'TooManyProperties', max: MAX_BULK_EDIT, total });
    }

    let producer: { readonly userId: string; readonly branchId: string | undefined } | undefined;
    if (change.field === 'producer') {
      const found = await this.deps.producers.find(change.userId);
      if (!found) return err({ type: 'ProducerNotFound' });
      producer = { userId: change.userId, branchId: found.branchId };
    }
    if (change.field === 'tags') {
      const wanted = [...new Set([...change.add, ...change.remove])];
      const existing = await this.deps.uow.run((tx) => tx.tags.findExistingIds(wanted));
      if (existing.length !== wanted.length) return err({ type: 'TagNotFound' });
    }

    const now = this.deps.clock.now();
    let updated = 0;
    let unchanged = 0;
    let skippedCount = 0;
    const skipped: { code: string; reason: BulkSkipReason }[] = [];
    const skip = (code: string, reason: BulkSkipReason) => {
      skippedCount += 1;
      if (skipped.length < MAX_SKIPPED_DETAIL) skipped.push({ code, reason });
    };

    // Por clave (ID), no por página: si el cambio saca una propiedad del filtro, no se saltea otra.
    let afterId: string | undefined;
    for (let processed = 0; processed < total; processed += BATCH_SIZE) {
      const batch = await this.deps.list.matchingIds(criteria.value, {
        afterId,
        limit: Math.min(BATCH_SIZE, total - processed),
      });
      if (batch.length === 0) break;
      afterId = batch.at(-1)?.id;

      await this.deps.uow.run(async (tx) => {
        for (const { id, code } of batch) {
          const property = await findProperty(tx.properties, id);
          if (!property) continue;
          if (!canActOn(actor, OWNERSHIP_RULES.propertiesUpdate, property.ownership)) {
            skip(code, 'forbidden');
            continue;
          }
          const outcome = apply(property, change, producer, actor, now);
          if (outcome.kind === 'skipped') {
            skip(code, outcome.reason);
            continue;
          }
          if (outcome.kind === 'unchanged') {
            unchanged += 1;
            continue;
          }
          await tx.properties.save(property, actor.id);
          await tx.events.publish(property.pullEvents());
          await tx.audit.record(outcome.entry);
          updated += 1;
        }
      });
    }

    return ok({ updated, unchanged, skipped, skippedCount });
  }
}

type Outcome =
  | { readonly kind: 'changed'; readonly entry: AuditEntry }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'skipped'; readonly reason: BulkSkipReason };

/** Aplica el cambio sobre una propiedad y arma su entrada de auditoría. */
function apply(
  property: Property,
  change: Change,
  producer: { readonly userId: string; readonly branchId: string | undefined } | undefined,
  actor: Actor,
  now: Date,
): Outcome {
  switch (change.field) {
    case 'status': {
      const from = property.status;
      const result = property.changeStatus(change.status, now);
      if (result.isErr()) {
        return {
          kind: 'skipped',
          reason: result.error.type === 'PropertyInTrash' ? 'in_trash' : 'invalid_transition',
        };
      }
      if (!result.value) return { kind: 'unchanged' };
      return {
        kind: 'changed',
        entry: auditAction(
          actor,
          propertyTarget('property.status_changed', property.id),
          diffChanges({ status: from }, { status: change.status }),
        ),
      };
    }
    case 'producer': {
      if (producer === undefined) return { kind: 'unchanged' };
      const before = {
        producerUserId: property.producerUserId,
        branchId: property.ownership.ownerBranchId,
      };
      const result = property.changeProducer(producer, now);
      if (result.isErr()) return { kind: 'skipped', reason: 'in_trash' };
      if (!result.value) return { kind: 'unchanged' };
      return {
        kind: 'changed',
        entry: auditAction(
          actor,
          propertyTarget('property.producer_changed', property.id),
          diffChanges(before, { producerUserId: producer.userId, branchId: producer.branchId }),
        ),
      };
    }
    case 'price': {
      const before = operationsState(property);
      const result = property.changePrice(
        { operation: change.operation, currency: change.currency, priceCents: change.price },
        now,
      );
      if (result.isErr()) {
        return {
          kind: 'skipped',
          reason: result.error.type === 'OperationNotFound' ? 'operation_not_found' : 'in_trash',
        };
      }
      if (!result.value) return { kind: 'unchanged' };
      const entry = auditUpdated(
        actor,
        propertyTarget('property.updated', property.id),
        before,
        operationsState(property),
      );
      return entry ? { kind: 'changed', entry } : { kind: 'unchanged' };
    }
    case 'tags': {
      const before = [...property.tagIds].sort();
      const result = property.changeTags({ add: change.add, remove: change.remove }, now);
      if (result.isErr()) return { kind: 'skipped', reason: 'in_trash' };
      if (!result.value) return { kind: 'unchanged' };
      return {
        kind: 'changed',
        entry: auditAction(
          actor,
          propertyTarget('property.tags_changed', property.id),
          diffChanges({ tagIds: before }, { tagIds: [...property.tagIds].sort() }),
        ),
      };
    }
  }
}

function operationsState(property: Property) {
  return {
    operations: property.toSnapshot().operations.map((o) => ({
      operation: o.operation,
      currency: o.currency,
      priceCents: o.priceCents ?? null,
    })),
  };
}
