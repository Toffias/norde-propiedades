import { accessScope, canActOn, OWNERSHIP_RULES } from '../../identity';
import {
  auditAction,
  auditUpdated,
  diffChanges,
  err,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { GeocodingOutcome } from '../contracts';
import { Coordinates, type InvalidCoordinatesError } from '../domain/coordinates';
import type { Development } from '../domain/development';
import type { DevelopmentRepository } from '../domain/development.repository';
import { idOf, placeFromLineage, type LocationNotFoundError, type Place } from './catalog-support';
import type { Geocoder } from './ports/geocoder';
import type { PropertiesTransaction, PropertiesUnitOfWork } from './ports/properties-transaction';
import type { InvalidInputError } from './property-support';

// Lo que comparten los commands de emprendimientos: auditoría, búsqueda por ID y pertenencia.

export interface DevelopmentNotFoundError {
  readonly type: 'DevelopmentNotFound';
}

/** Lo que falla en toda edición desde la ficha, antes de tocar el emprendimiento. */
export type EditDevelopmentError = ForbiddenError | InvalidInputError | DevelopmentNotFoundError;

/** Los valores del alta: lo que se carga al crear (los vacíos no se guardan). */
export function developmentCreatedState(development: Development): AuditState {
  const s = development.toSnapshot();
  return {
    code: s.code,
    name: s.name,
    developmentType: s.kind,
    status: s.status,
    privateAddress: s.privateAddress,
    publishAddress: s.publishAddress,
    portalTitle: s.portalTitle,
    locationId: s.locationId,
    latitude: s.coordinates?.latitude,
    longitude: s.coordinates?.longitude,
    developerName: s.developerName,
    commercialContactClientId: s.commercialContactClientId,
    producerUserId: s.producerUserId,
    branchId: s.branchId,
  };
}

/** Todo lo que se edita, campo por campo, con valores crudos. Las listas van ordenadas. */
export function developmentAuditState(development: Development): AuditState {
  const s = development.toSnapshot();
  return {
    code: s.code,
    name: s.name,
    developmentType: s.kind,
    status: s.status,
    constructionStatus: s.constructionStatus,
    deliveryDate: s.deliveryDate,
    privateAddress: s.privateAddress,
    publishAddress: s.publishAddress,
    portalTitle: s.portalTitle,
    locationId: s.locationId,
    latitude: s.coordinates?.latitude,
    longitude: s.coordinates?.longitude,
    developerName: s.developerName,
    commercialContactClientId: s.commercialContactClientId,
    websiteUrl: s.websiteUrl,
    description: s.description,
    financingDetails: s.financingDetails,
    ...s.deal,
    featureIds: [...s.featureIds].sort(),
    tagIds: [...s.tagIds].sort(),
    producerUserId: s.producerUserId,
    branchId: s.branchId,
    // En orden: el reparto depende de él.
    chances: s.chances.map((c) => ({ userId: c.userId, weight: c.weight })),
  };
}

/**
 * Las entradas del emprendimiento llevan el contacto comercial en `client_ids` (el de ahora y el de
 * antes, si cambió): así la supresión de ese cliente las encuentra.
 */
export function developmentTarget(
  action: string,
  development: Development,
  previousClientId?: string,
): AuditTarget {
  const clientIds = new Set<string>();
  const current = development.toSnapshot().commercialContactClientId;
  if (current !== undefined) clientIds.add(current);
  if (previousClientId !== undefined) clientIds.add(previousClientId);
  return { action, entityType: 'development', entityId: development.id, clientIds: [...clientIds] };
}

export async function findDevelopment(
  developments: DevelopmentRepository,
  rawId: string,
): Promise<Development | undefined> {
  const id = parseId<'Development'>(rawId);
  return id.isOk() ? developments.findById(id.value) : undefined;
}

/** Puede editar al menos sus emprendimientos: se chequea antes de validar el input. */
export function canEditDevelopments(actor: Actor): boolean {
  return accessScope(actor, OWNERSHIP_RULES.developmentsUpdate) !== undefined;
}

/**
 * El emprendimiento a editar, si existe y el actor puede editarlo: los propios, los de su sucursal
 * o todos, según sus permisos.
 */
export async function loadDevelopmentForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  developmentId: string,
): Promise<Result<Development, ForbiddenError | DevelopmentNotFoundError>> {
  const development = await findDevelopment(tx.developments, developmentId);
  if (!development) return err({ type: 'DevelopmentNotFound' });
  if (!canActOn(actor, OWNERSHIP_RULES.developmentsUpdate, development.ownership)) {
    return err({ type: 'Forbidden' });
  }
  return ok(development);
}

/**
 * Una edición en línea de la ficha: carga el emprendimiento con su chequeo de pertenencia, aplica el
 * cambio y, si cambió algo, lo guarda con el diff en el historial. `action` registra el cambio como
 * acción explícita (estado, etiquetas); sin ella, es una edición (`development.updated`).
 */
export function runDevelopmentEdit<E>(
  uow: PropertiesUnitOfWork,
  actor: Actor,
  developmentId: string,
  edit: {
    readonly action?: string;
    readonly apply: (
      development: Development,
      tx: PropertiesTransaction,
    ) => Result<boolean, E> | Promise<Result<boolean, E>>;
  },
): Promise<Result<void, E | ForbiddenError | DevelopmentNotFoundError>> {
  return uow.run(
    async (tx): Promise<Result<void, E | ForbiddenError | DevelopmentNotFoundError>> => {
      const loaded = await loadDevelopmentForEdit(tx, actor, developmentId);
      if (loaded.isErr()) return err(loaded.error);
      const development = loaded.value;
      const before = developmentAuditState(development);
      const previousClientId = development.toSnapshot().commercialContactClientId;
      const changed = await edit.apply(development, tx);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);
      const after = developmentAuditState(development);
      const entry =
        edit.action === undefined
          ? auditUpdated(
              actor,
              developmentTarget('development.updated', development, previousClientId),
              before,
              after,
            )
          : auditAction(
              actor,
              developmentTarget(edit.action, development, previousClientId),
              diffChanges(before, after),
            );
      await tx.developments.save(development, actor.id);
      await tx.events.publish(development.pullEvents());
      if (entry !== undefined) await tx.audit.record(entry);
      return ok(undefined);
    },
  );
}

/** Barrio, localidad y provincia de la ubicación del catálogo (obligatoria en un emprendimiento). */
export async function resolveDevelopmentPlace(
  tx: PropertiesTransaction,
  locationId: string,
): Promise<Result<Place, LocationNotFoundError>> {
  const id = idOf<'Location'>(locationId);
  const lineage = id === undefined ? [] : await tx.locations.findLineage(id);
  if (lineage.length === 0) return err({ type: 'LocationNotFound' });
  return ok(placeFromLineage(locationId, lineage));
}

/** Coordenadas cargadas a mano, validadas. */
export function manualCoordinates(input: {
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
}): Result<Coordinates | undefined, InvalidCoordinatesError> {
  if (input.latitude === undefined || input.longitude === undefined) return ok(undefined);
  return Coordinates.create(input.latitude, input.longitude);
}

/**
 * Busca las coordenadas de la dirección privada con el geocodificador. Si no las encuentra o el
 * servicio falla, el resultado lo dice y quedan para completar a mano. Se llama fuera de la
 * transacción: es un servicio externo.
 */
export async function locateDevelopment(
  geocoder: Geocoder,
  privateAddress: string,
  place: Place,
): Promise<{ readonly coordinates: Coordinates | undefined; readonly outcome: GeocodingOutcome }> {
  const located = await geocoder.locate({
    street: privateAddress.trim(),
    streetNumber: undefined,
    neighborhood: place.neighborhood,
    city: place.city,
    province: place.province,
  });
  if (located.isErr()) return { coordinates: undefined, outcome: 'failed' };
  if (located.value === undefined) return { coordinates: undefined, outcome: 'not_found' };
  const valid = Coordinates.create(located.value.latitude, located.value.longitude);
  return valid.isOk()
    ? { coordinates: valid.value, outcome: 'found' }
    : { coordinates: undefined, outcome: 'not_found' };
}
