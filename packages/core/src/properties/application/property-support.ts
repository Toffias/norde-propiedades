import { accessScope, canActOn, OWNERSHIP_RULES } from '../../identity';
import {
  auditAction,
  auditUpdated,
  diffChanges,
  err,
  ok,
  parseId,
  type Actor,
  type AuditEntry,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { Property } from '../domain/property';
import type { PropertyRepository } from '../domain/property.repository';
import type { PropertiesTransaction, PropertiesUnitOfWork } from './ports/properties-transaction';

// Lo que comparten los commands de propiedades: auditoría y búsqueda por ID.

export interface PropertyNotFoundError {
  readonly type: 'PropertyNotFound';
}

export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

/** Lo que falla en toda edición desde la ficha, antes de tocar la propiedad. */
export type EditPropertyError = ForbiddenError | InvalidInputError | PropertyNotFoundError;

/** Un `safeParse` fallido, como error esperado. */
export function invalidInput(error: {
  readonly issues: readonly { readonly message: string }[];
}): InvalidInputError {
  return { type: 'InvalidInput', issues: error.issues.map((issue) => issue.message) };
}

/** Valores crudos del alta. Los usuarios y la sucursal van por ID. */
export function propertyAuditState(property: Property): AuditState {
  const s = property.toSnapshot();
  return {
    code: s.code,
    propertyType: s.kind,
    status: s.status,
    street: s.address.street,
    streetNumber: s.address.streetNumber,
    floor: s.address.floor,
    unit: s.address.unit,
    neighborhood: s.address.neighborhood,
    city: s.address.city,
    province: s.address.province,
    publishAddress: s.publishAddress,
    portalTitle: s.portalTitle,
    latitude: s.coordinates?.latitude,
    longitude: s.coordinates?.longitude,
    locationId: s.locationId,
    developmentId: s.developmentId,
    operations: s.operations.map((o) => ({
      operation: o.operation,
      currency: o.currency,
      priceCents: o.priceCents ?? null,
    })),
    producerUserId: s.producerUserId,
    branchId: s.branchId,
  };
}

/**
 * Todo lo que se edita en la ficha, campo por campo, para el diff de cada edición en línea. Las
 * listas van ordenadas: el orden en que se marcaron no es un cambio.
 */
export function propertyDetailAuditState(property: Property): AuditState {
  const s = property.toSnapshot();
  return {
    ...propertyAuditState(property),
    operations: s.operations.map((o) => ({
      operation: o.operation,
      currency: o.currency,
      priceCents: o.priceCents ?? null,
      priceOnRequest: o.priceOnRequest,
      commissionPct: o.commissionPct ?? null,
    })),
    description: s.description,
    ...s.characteristics,
    ...s.deal,
    featureIds: [...s.featureIds].sort(),
    tagIds: [...s.tagIds].sort(),
    customAttributes: Object.fromEntries(
      s.customAttributes.map((entry) => [entry.attributeId, entry.value]),
    ),
    maintenanceUserId: s.internal.maintenanceUserId,
    appraiserUserIds: [...s.internal.appraiserUserIds].sort(),
    keysLocation: s.internal.keysLocation,
    legalInfo: s.internal.legalInfo,
    internalComments: s.internal.internalComments,
    ...s.publication,
  };
}

export function propertyTarget(action: string, propertyId: string): AuditTarget {
  return { action, entityType: 'property', entityId: propertyId, clientIds: [] };
}

export async function findProperty(
  properties: PropertyRepository,
  rawId: string,
): Promise<Property | undefined> {
  const id = parseId<'Property'>(rawId);
  return id.isOk() ? properties.findById(id.value) : undefined;
}

/** Puede editar al menos sus propiedades: se chequea antes de validar el input. */
export function canEditProperties(actor: Actor): boolean {
  return accessScope(actor, OWNERSHIP_RULES.propertiesUpdate) !== undefined;
}

/**
 * La propiedad a editar, si existe y el actor puede editarla: las propias, las de su sucursal o
 * todas, según sus permisos.
 */
export async function loadForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  propertyId: string,
): Promise<Result<Property, ForbiddenError | PropertyNotFoundError>> {
  const property = await findProperty(tx.properties, propertyId);
  if (!property) return err({ type: 'PropertyNotFound' });
  if (!canActOn(actor, OWNERSHIP_RULES.propertiesUpdate, property.ownership)) {
    return err({ type: 'Forbidden' });
  }
  return ok(property);
}

/** Guarda la edición, sus eventos y su entrada de historial en la misma transacción. */
export async function saveEdit(
  tx: PropertiesTransaction,
  property: Property,
  actor: Actor,
  entry: AuditEntry | undefined,
): Promise<void> {
  await tx.properties.save(property, actor.id);
  await tx.events.publish(property.pullEvents());
  if (entry !== undefined) await tx.audit.record(entry);
}

/**
 * Una edición en línea de la ficha: carga la propiedad con su chequeo de pertenencia, aplica el
 * cambio y, si cambió algo, la guarda con el diff en el historial. `action` registra el cambio
 * como acción explícita (cambio de estado, de captador, de etiquetas o de publicación); sin ella,
 * es una edición (`property.updated`).
 */
export function runPropertyEdit<E>(
  uow: PropertiesUnitOfWork,
  actor: Actor,
  propertyId: string,
  edit: {
    readonly action?: string;
    readonly apply: (
      property: Property,
      tx: PropertiesTransaction,
    ) => Result<boolean, E> | Promise<Result<boolean, E>>;
  },
): Promise<Result<void, E | ForbiddenError | PropertyNotFoundError>> {
  return uow.run(async (tx): Promise<Result<void, E | ForbiddenError | PropertyNotFoundError>> => {
    const loaded = await loadForEdit(tx, actor, propertyId);
    if (loaded.isErr()) return err(loaded.error);
    const property = loaded.value;
    const before = propertyDetailAuditState(property);
    const changed = await edit.apply(property, tx);
    if (changed.isErr()) return err(changed.error);
    if (!changed.value) return ok(undefined);
    const after = propertyDetailAuditState(property);
    const entry =
      edit.action === undefined
        ? auditUpdated(actor, propertyTarget('property.updated', property.id), before, after)
        : auditAction(actor, propertyTarget(edit.action, property.id), diffChanges(before, after));
    await saveEdit(tx, property, actor, entry);
    return ok(undefined);
  });
}
