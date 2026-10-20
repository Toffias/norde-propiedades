import type { FileStorage } from '../../../settings';
import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  nextId,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
  type SpreadsheetReader,
} from '../../../shared';
import { Location } from '../../domain/location';
import { Property, type PropertyId } from '../../domain/property';
import { EMPTY_DEAL_ATTRIBUTES, EMPTY_INTERNAL_INFO } from '../../domain/property-details';
import {
  MAX_PROPERTY_IMPORT_ROWS,
  type PropertyImport,
  type PropertyImportFailure,
  type PropertyImportField,
  type PropertyImportProblemCode,
  type PropertyImportRowOutcome,
  type PropertyImportStatus,
} from '../../domain/property-import';
import { ensureTypeEnabled } from '../../domain/property-type-settings';
import { sameDevelopmentName, type TokkoPlace } from '../../domain/tokko-property';
import { catalogTarget, locationAuditState } from '../catalog-support';
import { developmentTarget } from '../development-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyImportDirectory } from '../ports/property-import-directory';
import type { Producers } from '../ports/user-names';
import { readPropertyImportRow, type ImportedProperty } from '../property-import-row';
import { propertyImportTarget } from '../property-import-support';
import { propertyAuditState } from '../property-support';
import type { PropertyImportNotFoundError } from '../queries/get-property-import';

export interface InvalidPropertyImportIdError {
  readonly type: 'InvalidInput';
}

export type RunPropertyImportError =
  ForbiddenError | InvalidPropertyImportIdError | PropertyImportNotFoundError;

interface RowProblem {
  readonly code: PropertyImportProblemCode;
  readonly field: PropertyImportField | undefined;
  readonly propertyId?: string | undefined;
}

/** El productor de la fila: el usuario activo con ese nombre, con su sucursal. */
interface RowProducer {
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
function expectOk<T, E extends { readonly type: string }>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Unexpected ${result.error.type} importing a property`);
  return result.value;
}

/** Barrio, localidad y provincia vacíos no van al historial. */
function withoutEmptyTexts(state: AuditState): AuditState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value !== ''));
}

/**
 * El job de `properties.import_requested`: lee la exportación de Tokko guardada y crea una
 * propiedad por fila, disponible, con el "Ref" de Tokko como código. Una fila con un código que ya
 * existe no se vuelve a crear. Cada fila va en su propia transacción junto con el avance: si el job
 * se corta, retoma donde quedó.
 *
 * - La ubicación sale del catálogo: CABA con su barrio; el GBA y la costa con su partido. La
 *   localidad o el barrio que falta se crea. Otro país queda como texto.
 * - El productor es el usuario activo con ese nombre; si no hay uno, quien pidió la importación.
 * - El propietario se busca o se crea en contactos por su teléfono o email.
 * - Si hay un emprendimiento con ese nombre, la propiedad queda como su unidad.
 *
 * Lo creado queda auditado como `system:import`, agrupado por la importación. Al terminar se borra
 * el archivo, que tiene datos personales.
 */
export class RunPropertyImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly directory: PropertyImportDirectory;
      readonly producers: Producers;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  /** Lo ya buscado en esta corrida, por nombre normalizado (`null`: no hay uno). */
  readonly #producers = new Map<string, RowProducer | null>();
  readonly #developments = new Map<string, string | null>();

  async execute(
    input: { readonly importId: string },
    actor: Actor,
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunPropertyImportError>> {
    if (!actor.can('properties:run-imports')) return err({ type: 'Forbidden' });
    const id = parseId<'PropertyImport'>(input.importId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const job = await this.deps.uow.run((tx) => tx.propertyImports.findById(id.value));
    if (!job) return err({ type: 'PropertyImportNotFound' });
    if (job.isFinished) return ok({ status: job.status });
    const runner = actor.withCorrelation(job.id);

    await this.deps.uow.run(async (tx) => {
      job.start(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
    });

    const stored = await this.deps.storage.get(job.storageKey);
    if (!stored) return this.fail(job, 'file_missing', runner);
    const sheet = await this.deps.reader.open(stored.bytes);
    if (sheet.isErr()) return this.fail(job, 'unreadable_file', runner);
    if (sheet.value.rowCount > MAX_PROPERTY_IMPORT_ROWS) {
      return this.fail(job, 'too_many_rows', runner);
    }

    const fallback = await this.requester(job);
    let index = 0;
    for await (const row of sheet.value.rows()) {
      const rowIndex = index;
      index += 1;
      if (job.wasProcessed(rowIndex)) continue;
      await this.importRow(runner, job, fallback, row.rowNumber, row.cells);
    }

    await this.deps.uow.run(async (tx) => {
      job.finish(this.deps.clock.now());
      await tx.propertyImports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.finished', job.id), {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: job.totals.created },
          existing: { before: null, after: job.totals.existing },
          failed: { before: null, after: job.totals.failed },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }

  /** Quien pidió la importación, con su sucursal: el productor si la fila no trae uno. */
  private async requester(job: PropertyImport): Promise<RowProducer | undefined> {
    const found = await this.deps.producers.find(job.requestedBy);
    return found && { userId: job.requestedBy, branchId: found.branchId };
  }

  private async importRow(
    runner: Actor,
    job: PropertyImport,
    fallback: RowProducer | undefined,
    rowNumber: number,
    cells: readonly (string | undefined)[],
  ): Promise<void> {
    const problems: RowProblem[] = [];
    let outcome: PropertyImportRowOutcome = 'failed';

    const read = readPropertyImportRow(cells, job.columns);
    if (read.isErr()) {
      problems.push(read.error);
    } else {
      const row = read.value;
      const blocked = await this.deps.uow.run((tx) => this.check(tx, row));
      if (blocked) {
        problems.push(blocked);
        if (blocked.code === 'already_imported') outcome = 'existing';
      } else {
        const producer =
          (row.producerName === undefined
            ? undefined
            : await this.findProducer(row.producerName)) ?? fallback;
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
            : await this.findDevelopment(row.developmentName);
        if (row.developmentName !== undefined && developmentId === undefined) {
          problems.push({ code: 'development_not_found', field: 'development' });
        }

        const propertyId = nextId<'Property'>(this.deps.ids);
        await this.deps.uow.run((tx) =>
          this.create(tx, runner, {
            propertyId,
            row,
            producer,
            ownerClientId: owner?.clientId,
            developmentId,
          }),
        );
        outcome = 'created';
        problems.forEach((problem, i) => {
          problems[i] = { ...problem, propertyId };
        });
      }
    }

    await this.deps.uow.run(async (tx) => {
      for (const problem of problems) {
        await tx.propertyImports.addProblem(
          job.id,
          { rowNumber, code: problem.code, field: problem.field, propertyId: problem.propertyId },
          this.deps.clock.now(),
        );
      }
      job.recordRow(outcome, this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
    });
  }

  /** Si la fila no se puede crear: el código ya existe o el tipo no está habilitado. */
  private async check(
    tx: PropertiesTransaction,
    row: ImportedProperty,
  ): Promise<RowProblem | undefined> {
    const existing = await tx.properties.findByCode(row.code);
    if (existing?.isDeleted)
      return { code: 'code_in_trash', field: 'code', propertyId: existing.id };
    if (existing) return { code: 'already_imported', field: 'code', propertyId: existing.id };
    const enabled = ensureTypeEnabled(await tx.typeSettings.find(row.kind));
    if (enabled.isErr()) return { code: 'type_disabled', field: 'propertyType' };
    return undefined;
  }

  private async create(
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
    const place = await this.resolvePlace(tx, runner, row.place);
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
  private async resolvePlace(
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
    const city = await this.findOrCreate(tx, runner, province, place.city);
    const neighborhood =
      place.neighborhood === undefined
        ? undefined
        : await this.findOrCreate(tx, runner, city, place.neighborhood);
    return {
      locationId: (neighborhood ?? city).id,
      neighborhood: neighborhood?.name ?? '',
      city: city.name,
      province: province.name,
    };
  }

  private async findOrCreate(
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
  private async findProducer(name: string): Promise<RowProducer | undefined> {
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
  private async findDevelopment(name: string): Promise<string | undefined> {
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

  private async fail(
    job: PropertyImport,
    failure: PropertyImportFailure,
    runner: Actor,
  ): Promise<Result<{ readonly status: PropertyImportStatus }, RunPropertyImportError>> {
    await this.deps.uow.run(async (tx) => {
      job.fail(failure, this.deps.clock.now());
      await tx.propertyImports.save(job, runner.id);
      await tx.audit.record(
        auditAction(runner, propertyImportTarget('property_import.failed', job.id), {
          status: { before: 'running', after: 'failed' },
          failure: { before: null, after: failure },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }
}
