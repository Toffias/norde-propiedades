import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  ok,
  type Actor,
  type AuditState,
  type Result,
} from '../../shared';
import type {
  Development,
  DevelopmentInTrashError,
  DevelopmentUnitTemplate,
} from '../domain/development';
import {
  Property,
  type InvalidOperationsError,
  type NegativePriceError,
  type OperationInput,
  type PropertyId,
} from '../domain/property';
import type { PropertyKind } from '../domain/property-catalog';
import {
  EMPTY_CHARACTERISTICS,
  validateCharacteristics,
  type CoveredExceedsTotalError,
  type NegativeCharacteristicError,
} from '../domain/property-details';
import {
  ensureTypeEnabled,
  type PropertyTypeDisabledError,
} from '../domain/property-type-settings';

import { idOf, placeFromLineage, type Place } from './catalog-support';
import { developmentTarget } from './development-support';
import type { PropertiesTransaction } from './ports/properties-transaction';
import { propertyAuditState, propertyTarget } from './property-support';

// El alta de una unidad desde el emprendimiento, compartida por el alta manual y la importación
// desde Excel: lo que hereda, cómo se arma y cómo queda en el historial.

/** Lo que se carga de una unidad nueva; el resto lo hereda del emprendimiento. */
export interface NewUnitData {
  readonly developmentId: string;
  readonly propertyType: PropertyKind;
  /** Al menos una. */
  readonly operations: readonly [OperationInput, ...OperationInput[]];
  readonly floor: string | undefined;
  readonly unit: string | undefined;
  readonly rooms: number | undefined;
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
}

/** Lo que hereda la unidad y su ubicación del catálogo. */
export interface UnitBase {
  readonly template: DevelopmentUnitTemplate;
  readonly place: Place;
}

export type BuildUnitError =
  | NegativePriceError
  | InvalidOperationsError
  | NegativeCharacteristicError
  | CoveredExceedsTotalError;

/**
 * Lo que hereda una unidad de este tipo: el emprendimiento no puede estar en la papelera y el tipo
 * tiene que estar habilitado.
 */
export async function prepareUnitBase(
  tx: PropertiesTransaction,
  development: Development,
  propertyType: PropertyKind,
): Promise<Result<UnitBase, DevelopmentInTrashError | PropertyTypeDisabledError>> {
  const template = development.unitTemplate();
  if (template.isErr()) return err(template.error);
  const enabled = ensureTypeEnabled(await tx.typeSettings.find(propertyType));
  if (enabled.isErr()) return err(enabled.error);

  // Los emprendimientos cargados antes del panel pueden no tener ubicación del catálogo.
  const { locationId } = template.value;
  const id = locationId === undefined ? undefined : idOf<'Location'>(locationId);
  const lineage = id === undefined ? [] : await tx.locations.findLineage(id);
  const place: Place =
    locationId === undefined || lineage.length === 0
      ? { locationId: undefined, neighborhood: '', city: '', province: '' }
      : placeFromLineage(locationId, lineage);
  return ok({ template: template.value, place });
}

/**
 * Arma la unidad: una propiedad con `developmentId` que hereda la dirección privada y la de
 * publicar, la ubicación, las coordenadas, los servicios y amenities, el captador y la sucursal del
 * emprendimiento. Nace como borrador.
 */
export function buildUnit(
  base: UnitBase,
  data: NewUnitData,
  identity: { readonly id: PropertyId; readonly code: string; readonly now: Date },
): Result<Property, BuildUnitError> {
  const { template, place } = base;
  const { now } = identity;
  const [first, ...others] = data.operations;
  const created = Property.create({
    id: identity.id,
    code: identity.code,
    kind: data.propertyType,
    operation: first,
    address: {
      street: template.privateAddress,
      streetNumber: undefined,
      floor: data.floor,
      unit: data.unit,
      neighborhood: place.neighborhood,
      city: place.city,
      province: place.province,
    },
    publishAddress: template.publishAddress,
    portalTitle: undefined,
    coordinates: template.coordinates,
    locationId: place.locationId,
    developmentId: data.developmentId,
    producerUserId: template.producerUserId,
    branchId: template.branchId,
    now,
  });
  if (created.isErr()) return err(created.error);
  const unit = created.value;
  if (others.length > 0) {
    const operations = unit.setOperations(data.operations, now);
    if (operations.isErr()) {
      switch (operations.error.type) {
        case 'NegativePrice':
        case 'InvalidOperations':
          return err(operations.error);
        case 'PropertyInTrash':
        case 'InvalidCommission':
          // Recién creada no está en la papelera, y la comisión no se carga desde acá.
          throw new Error(`Unexpected ${operations.error.type} on a new unit`);
      }
    }
  }
  const characteristics = validateCharacteristics({
    ...EMPTY_CHARACTERISTICS,
    rooms: data.rooms,
    surfaceTotalM2: data.surfaceTotalM2,
    surfaceCoveredM2: data.surfaceCoveredM2,
  });
  if (characteristics.isErr()) return err(characteristics.error);
  // Recién creada no está en la papelera y las características ya se validaron: no puede fallar.
  unit.updateCharacteristics(characteristics.value, now);
  unit.updateFeatures(template.featureIds, now);
  return ok(unit);
}

/**
 * Guarda la unidad nueva con sus eventos: queda en el historial de la propiedad (`property.created`)
 * y en el del emprendimiento (`development.unit_added`).
 */
export async function saveNewUnit(
  tx: PropertiesTransaction,
  actor: Actor,
  unit: Property,
  development: Development,
): Promise<void> {
  await tx.properties.save(unit, actor.id);
  await tx.events.publish(unit.pullEvents());
  await tx.audit.record(
    auditCreated(actor, propertyTarget('property.created', unit.id), unitCreatedState(unit)),
  );
  await tx.audit.record(
    auditAction(
      actor,
      developmentTarget('development.unit_added', development),
      diffChanges({}, { unitId: unit.id, unitCode: unit.code }),
    ),
  );
}

/** Los valores del alta de la unidad: los del alta de una propiedad más lo heredado y lo cargado. */
function unitCreatedState(unit: Property): AuditState {
  const s = unit.toSnapshot();
  return {
    ...propertyAuditState(unit),
    rooms: s.characteristics.rooms,
    surfaceTotalM2: s.characteristics.surfaceTotalM2,
    surfaceCoveredM2: s.characteristics.surfaceCoveredM2,
    featureIds: s.featureIds.length === 0 ? undefined : [...s.featureIds].sort(),
  };
}
