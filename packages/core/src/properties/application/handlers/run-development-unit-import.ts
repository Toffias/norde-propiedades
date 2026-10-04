import type { FileStorage } from '../../../settings';
import {
  auditAction,
  auditUpdated,
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
import type { Development } from '../../domain/development';
import {
  MAX_UNIT_IMPORT_ROWS,
  unitDesignation,
  type DevelopmentUnitImport,
  type UnitImportFailure,
  type UnitImportField,
  type UnitImportProblemCode,
  type UnitImportRowOutcome,
  type UnitImportStatus,
} from '../../domain/development-unit-import';
import type { OperationInput, Property, PropertyId } from '../../domain/property';
import { validateCharacteristics } from '../../domain/property-details';
import { findDevelopment, developmentTarget } from '../development-support';
import {
  buildUnit,
  prepareUnitBase,
  saveNewUnit,
  type BuildUnitError,
  type UnitBase,
} from '../development-unit-creation';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ReferenceCodeAllocator } from '../ports/reference-code-allocator';
import type { DevelopmentUnitImportNotFoundError } from '../queries/get-development-unit-import';
import { propertyDetailAuditState, propertyTarget, saveEdit } from '../property-support';
import { readUnitImportRow, type ImportedUnit } from '../unit-import-row';

export interface InvalidUnitImportIdError {
  readonly type: 'InvalidInput';
}

export type RunDevelopmentUnitImportError =
  ForbiddenError | InvalidUnitImportIdError | DevelopmentUnitImportNotFoundError;

interface RowProblem {
  readonly code: UnitImportProblemCode;
  readonly field: UnitImportField | undefined;
  readonly propertyId?: string | undefined;
}

/** Qué hacer con una fila, decidido antes de escribir (la unidad nueva pide un código antes). */
type RowPlan =
  | { readonly kind: 'problem'; readonly problem: RowProblem }
  | { readonly kind: 'update'; readonly propertyId: PropertyId; readonly row: ImportedUnit }
  | { readonly kind: 'create'; readonly base: UnitBase; readonly row: NewUnitRow };

type NewUnitRow = ImportedUnit & {
  readonly propertyType: NonNullable<ImportedUnit['propertyType']>;
  readonly newOperations: readonly [OperationInput, ...OperationInput[]];
};

/** Unidades con ese piso y unidad que se buscan: con dos ya es ambiguo. */
const DESIGNATION_MATCHES = 2;

const OPERATION_FIELDS = {
  sale: ['saleCurrency', 'salePrice'],
  rent: ['rentCurrency', 'rentPrice'],
  temporary_rent: ['temporaryRentCurrency', 'temporaryRentPrice'],
} as const satisfies Record<string, readonly [UnitImportField, UnitImportField]>;

const problem = (
  code: UnitImportProblemCode,
  field?: UnitImportField,
  propertyId?: string,
): RowPlan => ({ kind: 'problem', problem: { code, field, propertyId } });

/**
 * El job de `properties.unit_import_requested`: lee el Excel guardado y procesa cada fila. La clave
 * es el piso y la unidad dentro del emprendimiento: si ya existe una unidad así, se actualiza (tipo
 * de propiedad no, se usa solo al crear); si no, se crea heredando lo del emprendimiento, como el
 * alta manual. Las celdas vacías no borran datos. Cada fila va en su propia transacción junto con
 * el avance, así un corte retoma donde quedó. Los cambios quedan auditados como `system:import`,
 * agrupados por la importación. Al terminar se borra el archivo.
 */
export class RunDevelopmentUnitImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reader: SpreadsheetReader;
      readonly storage: FileStorage;
      readonly codes: ReferenceCodeAllocator;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: { readonly importId: string },
    actor: Actor,
  ): Promise<Result<{ readonly status: UnitImportStatus }, RunDevelopmentUnitImportError>> {
    if (!actor.can('properties:run-imports')) return err({ type: 'Forbidden' });
    const id = parseId<'DevelopmentUnitImport'>(input.importId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const job = await this.deps.uow.run((tx) => tx.unitImports.findById(id.value));
    if (!job) return err({ type: 'DevelopmentUnitImportNotFound' });
    if (job.isFinished) return ok({ status: job.status });
    const runner = actor.withCorrelation(job.id);

    const development = await this.deps.uow.run(async (tx) => {
      job.start(this.deps.clock.now());
      await tx.unitImports.save(job, actor.id);
      return findDevelopment(tx.developments, job.developmentId);
    });
    if (!development || development.isDeleted) {
      return this.fail(job, 'development_unavailable', runner, development);
    }

    const stored = await this.deps.storage.get(job.storageKey);
    if (!stored) return this.fail(job, 'file_missing', runner, development);
    const sheet = await this.deps.reader.open(stored.bytes);
    if (sheet.isErr()) return this.fail(job, 'unreadable_file', runner, development);
    if (sheet.value.rowCount > MAX_UNIT_IMPORT_ROWS) {
      return this.fail(job, 'too_many_rows', runner, development);
    }

    let index = 0;
    for await (const row of sheet.value.rows()) {
      const rowIndex = index;
      index += 1;
      if (job.wasProcessed(rowIndex)) continue;
      await this.importRow(runner, job, development, row.rowNumber, row.cells);
    }

    await this.deps.uow.run(async (tx) => {
      job.finish(this.deps.clock.now());
      await tx.unitImports.save(job, actor.id);
      await tx.audit.record(
        auditAction(runner, developmentTarget('development.units_imported', development), {
          importId: { before: null, after: job.id },
          created: { before: null, after: job.totals.created },
          updated: { before: null, after: job.totals.updated },
          unchanged: { before: null, after: job.totals.unchanged },
          failed: { before: null, after: job.totals.failed },
        }),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }

  /** Decide qué hacer con la fila, pide el código si es una unidad nueva y la escribe. */
  private async importRow(
    runner: Actor,
    job: DevelopmentUnitImport,
    development: Development,
    rowNumber: number,
    cells: readonly (string | undefined)[],
  ): Promise<void> {
    let plan = await this.deps.uow.run((tx) => this.plan(tx, job, development, cells));
    let code: string | undefined;
    if (plan.kind === 'create') {
      const allocated = await this.deps.codes.allocate(
        {
          kind: plan.row.propertyType,
          producerUserId: plan.base.template.producerUserId,
          branchId: plan.base.template.branchId,
        },
        runner,
      );
      if (allocated.isErr()) plan = problem('code_unavailable');
      else code = allocated.value;
    }

    await this.deps.uow.run(async (tx) => {
      const outcome = await this.apply(tx, runner, job, development, plan, code, rowNumber);
      job.recordRow(outcome, this.deps.clock.now());
      await tx.unitImports.save(job, runner.id);
    });
  }

  private async plan(
    tx: PropertiesTransaction,
    job: DevelopmentUnitImport,
    development: Development,
    cells: readonly (string | undefined)[],
  ): Promise<RowPlan> {
    const read = readUnitImportRow(cells, job.mapping);
    if (read.isErr()) return problem(read.error.code, read.error.field);
    const row = read.value;

    const matches = await tx.properties.findUnitsByDesignation(
      development.id,
      unitDesignation(row.floor, row.unit),
      DESIGNATION_MATCHES,
    );
    const active = matches.filter((unit) => !unit.isDeleted);
    const [existing] = active;
    if (active.length > 1) return problem('ambiguous_unit', 'unit');
    if (existing) return { kind: 'update', propertyId: existing.id, row };
    const [trashed] = matches;
    if (trashed) return problem('unit_in_trash', 'unit', trashed.id);

    if (row.propertyType === undefined) return problem('missing_type', 'propertyType');
    const newOperations: OperationInput[] = [];
    for (const operation of row.operations) {
      if (operation.currency === undefined) {
        return problem('missing_currency', OPERATION_FIELDS[operation.operation][0]);
      }
      newOperations.push({
        operation: operation.operation,
        currency: operation.currency,
        priceCents: operation.price?.cents,
      });
    }
    const [firstOperation, ...otherOperations] = newOperations;
    if (firstOperation === undefined) return problem('missing_operation');
    const base = await prepareUnitBase(tx, development, row.propertyType);
    if (base.isErr()) {
      if (base.error.type === 'PropertyTypeDisabled') {
        return problem('type_disabled', 'propertyType');
      }
      // El job arrancó con el emprendimiento fuera de la papelera.
      throw new Error(`Development ${development.id} went to the trash during an import`);
    }
    return {
      kind: 'create',
      base: base.value,
      row: {
        ...row,
        propertyType: row.propertyType,
        newOperations: [firstOperation, ...otherOperations],
      },
    };
  }

  private async apply(
    tx: PropertiesTransaction,
    runner: Actor,
    job: DevelopmentUnitImport,
    development: Development,
    plan: RowPlan,
    code: string | undefined,
    rowNumber: number,
  ): Promise<UnitImportRowOutcome> {
    const report = async (found: RowProblem): Promise<UnitImportRowOutcome> => {
      await tx.unitImports.addProblem(
        job.id,
        { rowNumber, code: found.code, field: found.field, propertyId: found.propertyId },
        this.deps.clock.now(),
      );
      return 'failed';
    };

    switch (plan.kind) {
      case 'problem':
        return report(plan.problem);
      case 'create': {
        if (code === undefined) return report({ code: 'code_unavailable', field: undefined });
        const created = this.createUnit(job, development, plan, code);
        if (!created.ok) return report(created.problem);
        await saveNewUnit(tx, runner, created.unit, development);
        return 'created';
      }
      case 'update': {
        const found = await tx.properties.findById(plan.propertyId);
        if (!found || found.isDeleted) return report({ code: 'unit_in_trash', field: 'unit' });
        const before = propertyDetailAuditState(found);
        const updated = this.updateUnit(job, found, plan.row);
        if (!updated.ok) return report({ ...updated.problem, propertyId: found.id });
        const { afterData, statusChanged } = updated;
        if (!updated.dataChanged && !statusChanged) return 'unchanged';
        await saveEdit(
          tx,
          found,
          runner,
          auditUpdated(runner, propertyTarget('property.updated', found.id), before, afterData),
        );
        if (statusChanged) {
          await tx.audit.record(
            auditAction(
              runner,
              propertyTarget('property.status_changed', found.id),
              diffChanges(afterData, propertyDetailAuditState(found)),
            ),
          );
        }
        return 'updated';
      }
    }
  }

  private createUnit(
    job: DevelopmentUnitImport,
    development: Development,
    plan: Extract<RowPlan, { kind: 'create' }>,
    code: string,
  ):
    | { readonly ok: true; readonly unit: Property }
    | { readonly ok: false; readonly problem: RowProblem } {
    const now = this.deps.clock.now();
    const { row } = plan;
    const built = buildUnit(
      plan.base,
      {
        developmentId: development.id,
        propertyType: row.propertyType,
        operations: row.newOperations,
        floor: row.floor,
        unit: row.unit,
        rooms: row.rooms,
        surfaceTotalM2: row.surfaceTotalM2,
        surfaceCoveredM2: row.surfaceCoveredM2,
      },
      { id: nextId<'Property'>(this.deps.ids), code, now },
    );
    if (built.isErr()) {
      return { ok: false, problem: { code: 'invalid_value', field: fieldOf(built.error) } };
    }
    const unit = built.value;
    if (row.status !== undefined) {
      const status = changeStatus(job, unit, row.status, now);
      if (status !== undefined) return { ok: false, problem: status };
    }
    return { ok: true, unit };
  }

  /**
   * Aplica a la unidad lo que trae la fila. El diff de datos va como edición (`property.updated`) y
   * el cambio de estado como acción explícita, igual que desde la ficha.
   */
  private updateUnit(
    job: DevelopmentUnitImport,
    unit: Property,
    row: ImportedUnit,
  ):
    | {
        readonly ok: true;
        readonly dataChanged: boolean;
        /** El estado después de los datos y antes del cambio de estado, para separar los diffs. */
        readonly afterData: AuditState;
        readonly statusChanged: boolean;
      }
    | { readonly ok: false; readonly problem: RowProblem } {
    const now = this.deps.clock.now();
    const snapshot = unit.toSnapshot();
    let changed = false;

    if (
      row.rooms !== undefined ||
      row.surfaceTotalM2 !== undefined ||
      row.surfaceCoveredM2 !== undefined
    ) {
      const characteristics = validateCharacteristics({
        ...snapshot.characteristics,
        rooms: row.rooms ?? snapshot.characteristics.rooms,
        surfaceTotalM2: row.surfaceTotalM2 ?? snapshot.characteristics.surfaceTotalM2,
        surfaceCoveredM2: row.surfaceCoveredM2 ?? snapshot.characteristics.surfaceCoveredM2,
      });
      if (characteristics.isErr()) {
        return { ok: false, problem: { code: 'invalid_value', field: 'surfaceCoveredM2' } };
      }
      const result = unit.updateCharacteristics(characteristics.value, now);
      if (result.isOk() && result.value) changed = true;
    }

    if (row.operations.length > 0) {
      const next: OperationInput[] = snapshot.operations.map((current) => ({ ...current }));
      for (const operation of row.operations) {
        const index = next.findIndex((o) => o.operation === operation.operation);
        const current = next[index];
        if (current === undefined) {
          if (operation.currency === undefined) {
            return {
              ok: false,
              problem: {
                code: 'missing_currency',
                field: OPERATION_FIELDS[operation.operation][0],
              },
            };
          }
          next.push({
            operation: operation.operation,
            currency: operation.currency,
            priceCents: operation.price?.cents,
          });
        } else {
          next[index] = {
            ...current,
            currency: operation.currency ?? current.currency,
            priceCents: operation.price === undefined ? current.priceCents : operation.price.cents,
          };
        }
      }
      const result = unit.setOperations(next, now);
      if (result.isErr()) {
        return { ok: false, problem: { code: 'invalid_value', field: undefined } };
      }
      if (result.value) changed = true;
    }

    const afterData = propertyDetailAuditState(unit);
    let statusChanged = false;
    if (row.status !== undefined && row.status !== unit.status) {
      const status = changeStatus(job, unit, row.status, now);
      if (status !== undefined) return { ok: false, problem: status };
      statusChanged = true;
    }
    return { ok: true, dataChanged: changed, afterData, statusChanged };
  }

  private async fail(
    job: DevelopmentUnitImport,
    failure: UnitImportFailure,
    runner: Actor,
    development: Development | undefined,
  ): Promise<Result<{ readonly status: UnitImportStatus }, RunDevelopmentUnitImportError>> {
    await this.deps.uow.run(async (tx) => {
      job.fail(failure, this.deps.clock.now());
      await tx.unitImports.save(job, runner.id);
      const changes = {
        importId: { before: null, after: job.id },
        failure: { before: null, after: failure },
      };
      await tx.audit.record(
        development === undefined
          ? auditAction(
              runner,
              {
                action: 'development.units_import_failed',
                entityType: 'development',
                entityId: job.developmentId,
                clientIds: [],
              },
              changes,
            )
          : auditAction(
              runner,
              developmentTarget('development.units_import_failed', development),
              changes,
            ),
      );
    });
    await this.deps.storage.delete(job.storageKey);
    return ok({ status: job.status });
  }
}

/**
 * Pasa la unidad al estado de la planilla. "Disponible" respeta el permiso de quien importó; uno
 * que no se elige a mano (reservada), una unidad reservada o una transición inválida es un problema
 * de la fila.
 */
function changeStatus(
  job: DevelopmentUnitImport,
  unit: Property,
  status: NonNullable<ImportedUnit['status']>,
  now: Date,
): RowProblem | undefined {
  if (status === 'available' && !job.canMarkAvailable && unit.status !== 'available') {
    return { code: 'status_forbidden', field: 'status' };
  }
  const changed = unit.changeStatus(status, now);
  if (changed.isOk()) return undefined;
  return changed.error.type === 'PropertyReserved'
    ? { code: 'unit_reserved', field: 'status' }
    : { code: 'invalid_status', field: 'status' };
}

/** El dato de la fila que explica un error del alta. */
function fieldOf(error: BuildUnitError): UnitImportField | undefined {
  switch (error.type) {
    case 'CoveredExceedsTotal':
      return 'surfaceCoveredM2';
    case 'NegativeCharacteristic':
      return 'rooms';
    case 'NegativePrice':
    case 'InvalidOperations':
      return undefined;
  }
}
