import {
  auditAction,
  auditCreated,
  diffChanges,
  nextId,
  parseId,
  type Actor,
  type AuditState,
  type Clock,
  type IdGenerator,
  type Result,
} from '../../shared';
import { Location } from '../domain/location';
import { Property, type PropertyId } from '../domain/property';
import { EMPTY_DEAL_ATTRIBUTES, EMPTY_INTERNAL_INFO } from '../domain/property-details';
import type { PropertyImportField, PropertyImportProblemCode } from '../domain/property-import';
import { ensureTypeEnabled } from '../domain/property-type-settings';
import { sameDevelopmentName, type TokkoPlace } from '../domain/tokko-property';

import { catalogTarget, locationAuditState } from './catalog-support';
import { developmentTarget } from './development-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from './ports/properties-transaction';
import type { PropertyImportDirectory } from './ports/property-import-directory';
import type { Producers } from './ports/user-names';
import type { ImportedProperty } from './property-import-row';
import { propertyAuditState } from './property-support';

// Lo que comparten las importaciones de propiedades de Tokko (la exportación `.csv` y la API):
// verificar que se pueda crear, buscar al productor, al propietario y al emprendimiento, y crear la
// propiedad con su ubicación del catálogo, auditada como `property.imported`.

export interface ImportRowProblem {
  readonly code: PropertyImportProblemCode;
  readonly field: PropertyImportField | undefined;
  readonly propertyId?: string | undefined;
}

/** El productor de la propiedad: el usuario activo con ese nombre, con su sucursal. */
export interface RowProducer {
  readonly userId: string;
  readonly branchId: string | undefined;
}

/** Barrio, localidad y provincia, con la ubicación del catálogo si la hay. */
interface ResolvedPlace {
  readonly locationId: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
}

/** El país del catálogo en el que están las provincias de Tokko. */
const CATALOG_COUNTRY = 'Argentina';

/** Sin acentos ni mayúsculas, como se comparan los nombres de usuario. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Para pasos que no pueden fallar con datos ya validados: si fallan, es un error de programación. */
export function expectOk<T, E extends { readonly type: string }>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Unexpected ${result.error.type} importing a property`);
  return result.value;
}

/** Barrio, localidad y provincia vacíos no van al historial. */
function withoutEmptyTexts(state: AuditState): AuditState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value !== ''));
}

/**
 * Crea las propiedades de una importación de Tokko. Guarda lo ya buscado en la corrida (productores
 * y emprendimientos por nombre): se usa una instancia por corrida.
 */
export class TokkoPropertyImporter {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly directory: PropertyImportDirectory;
      readonly producers: Producers;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  /** Lo ya buscado en esta corrida, por nombre normalizado (`null`: no hay uno). */
  readonly #producers = new Map<string, RowProducer | null>();
  readonly #developments = new Map<string, string | null>();

  /** Quien pidió la importación, con su sucursal: el productor si la fila no trae uno. */
  async requester(userId: string): Promise<RowProducer | undefined> {
    const found = await this.deps.producers.find(userId);
    return found && { userId, branchId: found.branchId };
  }

  /** Si la fila no se puede crear: el código ya existe o el tipo no está habilitado. */
  async check(
    tx: PropertiesTransaction,
    row: Pick<ImportedProperty, 'code' | 'kind'>,
  ): Promise<ImportRowProblem | undefined> {
    const existing = await tx.properties.findByCode(row.code);
    if (existing?.isDeleted)
      return { code: 'code_in_trash', field: 'code', propertyId: existing.id };
    if (existing) return { code: 'already_imported', field: 'code', propertyId: existing.id };
    const enabled = ensureTypeEnabled(await tx.typeSettings.find(row.kind));
    if (enabled.isErr()) return { code: 'type_disabled', field: 'propertyType' };
    return undefined;
  }

  /**
   * Crea la propiedad de una fila que pasó `check`: busca al productor (o queda `fallback`), al
   * propietario y al emprendimiento. Devuelve la propiedad creada y los avisos, ya con su ID.
   */
  async create(
    runner: Actor,
    row: ImportedProperty,
    fallback: RowProducer | undefined,
  ): Promise<{ readonly propertyId: PropertyId; readonly warnings: readonly ImportRowProblem[] }> {
    const problems: ImportRowProblem[] = [...row.warnings];
    const producer =
      (row.producerName === undefined ? undefined : await this.#findProducer(row.producerName)) ??
      fallback;
    // El propietario se busca o se crea en contactos, afuera de la transacción de la propiedad.
    const owner =
      row.owner &&
      (await this.deps.directory.findOrCreateOwner(
        {
          ...row.owner,
          sells: row.operations.some((o) => o.operation === 'sale'),
          rents: row.operations.some((o) => o.operation !== 'sale'),
          agentId: producer?.userId,
        },
        runner,
      ));
    if (row.owner && !owner) problems.push({ code: 'owner_not_linked', field: 'ownerPhone' });
    const developmentId =
      row.developmentName === undefined
        ? undefined
        : await this.#findDevelopment(row.developmentName);
    if (row.developmentName !== undefined && developmentId === undefined) {
      problems.push({ code: 'development_not_found', field: 'development' });
    }

    const propertyId = nextId<'Property'>(this.deps.ids);
    await this.deps.uow.run((tx) =>
      this.#create(tx, runner, {
        propertyId,
        row,
        producer,
        ownerClientId: owner?.clientId,
        developmentId,
      }),
    );
    return { propertyId, warnings: problems.map((problem) => ({ ...problem, propertyId })) };
  }

  async #create(
    tx: PropertiesTransaction,
    runner: Actor,
    data: {
      readonly propertyId: PropertyId;
      readonly row: ImportedProperty;
      readonly producer: RowProducer | undefined;
      readonly ownerClientId: string | undefined;
      readonly developmentId: string | undefined;
    },
  ): Promise<void> {
    const { row } = data;
    const now = this.deps.clock.now();
    const place = await this.#resolvePlace(tx, runner, row.place);
    const developmentId =
      data.developmentId === undefined ? undefined : parseId<'Development'>(data.developmentId);
    const development =
      developmentId?.isOk() === true
        ? await tx.developments.findById(developmentId.value)
        : undefined;
    const unitOf = development && !development.isDeleted ? development : undefined;

    const [first, ...others] = row.operations;
    const property = expectOk(
      Property.create({
        id: data.propertyId,
        code: row.code,
        kind: row.kind,
        operation: first,
        address: {
          street: row.address.street,
          streetNumber: row.address.streetNumber,
          floor: row.address.floor,
          unit: row.address.unit,
          neighborhood: place.neighborhood,
          city: place.city,
          province: place.province,
        },
        publishAddress: undefined,
        portalTitle: undefined,
        coordinates: undefined,
        locationId: place.locationId,
        developmentId: unitOf?.id,
        producerUserId: data.producer?.userId,
        branchId: data.producer?.branchId,
        now,
      }),
    );
    // Recién creada no está en la papelera y los datos ya se validaron al leer la fila.
    if (others.length > 0) expectOk(property.setOperations([first, ...others], now));
    expectOk(property.updateCharacteristics(row.characteristics, now));
    expectOk(
      property.updateDeal({ ...EMPTY_DEAL_ATTRIBUTES, expensesCents: row.expensesCents }, now),
    );
    if (row.internalComments !== undefined) {
      expectOk(
        property.updateInternalInfo(
          { ...EMPTY_INTERNAL_INFO, internalComments: row.internalComments },
          now,
        ),
      );
    }
    // En Tokko estaban activas: se importan disponibles.
    expectOk(property.changeStatus('available', now));

    await tx.properties.save(property, runner.id);
    if (data.ownerClientId !== undefined) {
      await tx.owners.add(property.id, data.ownerClientId, runner.id);
    }
    await tx.events.publish(property.pullEvents());
    const s = property.toSnapshot();
    await tx.audit.record(
      auditCreated(
        runner,
        {
          action: 'property.imported',
          entityType: 'property',
          entityId: property.id,
          clientIds: data.ownerClientId === undefined ? [] : [data.ownerClientId],
        },
        {
          ...withoutEmptyTexts(propertyAuditState(property)),
          ownerClientIds: data.ownerClientId === undefined ? undefined : [data.ownerClientId],
          rooms: s.characteristics.rooms,
          bedrooms: s.characteristics.bedrooms,
          bathrooms: s.characteristics.bathrooms,
          surfaceTotalM2: s.characteristics.surfaceTotalM2,
          surfaceCoveredM2: s.characteristics.surfaceCoveredM2,
          expensesCents: s.deal.expensesCents?.toString(),
        },
      ),
    );
    if (unitOf) {
      await tx.audit.record(
        auditAction(
          runner,
          developmentTarget('development.unit_added', unitOf),
          diffChanges({}, { unitId: property.id, unitCode: property.code }),
        ),
      );
    }
  }

  /** La ubicación del catálogo (creando la localidad o el barrio que falte), o los textos. */
  async #resolvePlace(
    tx: PropertiesTransaction,
    runner: Actor,
    place: TokkoPlace,
  ): Promise<ResolvedPlace> {
    const text: ResolvedPlace = {
      locationId: undefined,
      neighborhood: place.neighborhood ?? '',
      city: place.city,
      province: place.province,
    };
    if (!place.inCatalog) return text;
    const country = await tx.locations.findSibling(undefined, CATALOG_COUNTRY);
    const province = country && (await tx.locations.findSibling(country.id, place.province));
    if (!province) return text;
    const city = await this.#findOrCreate(tx, runner, province, place.city);
    const neighborhood =
      place.neighborhood === undefined
        ? undefined
        : await this.#findOrCreate(tx, runner, city, place.neighborhood);
    return {
      locationId: (neighborhood ?? city).id,
      neighborhood: neighborhood?.name ?? '',
      city: city.name,
      province: province.name,
    };
  }

  async #findOrCreate(
    tx: PropertiesTransaction,
    runner: Actor,
    parent: Location,
    name: string,
  ): Promise<Location> {
    const existing = await tx.locations.findSibling(parent.id, name);
    if (existing) return existing;
    const s = parent.toSnapshot();
    const created = expectOk(
      Location.create({
        id: nextId<'Location'>(this.deps.ids),
        name,
        parent: { id: s.id, kind: s.kind, path: s.path },
        now: this.deps.clock.now(),
      }),
    );
    await tx.locations.save(created, runner.id);
    await tx.audit.record(
      auditCreated(
        runner,
        catalogTarget('location', 'location.created', created.id),
        locationAuditState(created),
      ),
    );
    return created;
  }

  /** El usuario activo con ese nombre, si hay uno solo. */
  async #findProducer(name: string): Promise<RowProducer | undefined> {
    const key = nameKey(name);
    const cached = this.#producers.get(key);
    if (cached !== undefined) return cached ?? undefined;
    const matches = (await this.deps.directory.searchProducers(name)).filter(
      (candidate) => nameKey(candidate.name) === key,
    );
    const [match] = matches;
    const producer =
      matches.length === 1 && match ? { userId: match.userId, branchId: match.branchId } : null;
    this.#producers.set(key, producer);
    return producer ?? undefined;
  }

  /** El emprendimiento con ese nombre, si hay uno solo. */
  async #findDevelopment(name: string): Promise<string | undefined> {
    const key = nameKey(name);
    const cached = this.#developments.get(key);
    if (cached !== undefined) return cached ?? undefined;
    const matches = (await this.deps.directory.searchDevelopments(name)).filter((candidate) =>
      sameDevelopmentName(candidate.name, name),
    );
    const [match] = matches;
    const id = matches.length === 1 && match ? match.id : null;
    this.#developments.set(key, id);
    return id ?? undefined;
  }
}
