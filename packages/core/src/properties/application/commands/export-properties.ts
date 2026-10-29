import {
  auditAction,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  EXPORT_WITHOUT_BULK_PERMISSION,
  ExportPropertiesInputSchema,
  MAX_EXPORT_ROWS,
  type ExportPropertiesInput,
  type PropertyExportRow,
} from '../../contracts';
import { resolveSelection, type NoBranchAssignedError } from '../panel-filter';
import type {
  PanelPropertyFilterCriteria,
  PanelPropertyListQuery,
} from '../ports/panel-property-list-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyExportDetailsQuery } from '../ports/property-export-details-query';
import type { ExportFile, PropertyExportWriter } from '../ports/property-export-writer';
import type { UserNames } from '../ports/user-names';
import { toExportRows } from '../property-export-rows';
import type { InvalidInputError } from '../property-support';

export type ExportPropertiesError =
  | ForbiddenError
  | InvalidInputError
  | NoBranchAssignedError
  | { readonly type: 'NothingToExport' }
  | { readonly type: 'TooManyToExport'; readonly max: number; readonly total: number };

/** Filas por consulta: la planilla se arma de a lotes, sin cargar todo en memoria. */
const BATCH_SIZE = 200;

/**
 * Exporta las propiedades seleccionadas (las marcadas o todas las que cumplen el filtro) a CSV
 * o Excel (el PDF es `RequestPropertyListDocument`). Hasta 10 alcanza con `properties:export`; más, hace falta `properties:export-bulk`.
 * Lleva las columnas de la planilla de Tokko, con la dirección interna. El propietario (nombre,
 * email y celular) sale solo con `clients:read-owners`. La exportación queda en la auditoría con el
 * filtro, la cantidad y si incluyó propietarios.
 */
export class ExportProperties {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly list: PanelPropertyListQuery;
      readonly users: UserNames;
      readonly details: PropertyExportDetailsQuery;
      readonly writer: PropertyExportWriter;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ExportPropertiesInput,
    actor: Actor,
  ): Promise<Result<ExportFile, ExportPropertiesError>> {
    if (!actor.can('properties:export') && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }

    const parsed = ExportPropertiesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { format, selection } = parsed.data;
    const criteria = resolveSelection(selection, actor);
    if (criteria.isErr()) return err(criteria.error);

    const total = await this.deps.list.count(criteria.value);
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > EXPORT_WITHOUT_BULK_PERMISSION && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    if (total > MAX_EXPORT_ROWS) {
      return err({ type: 'TooManyToExport', max: MAX_EXPORT_ROWS, total });
    }

    const includeOwners = actor.can('clients:read-owners');
    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          {
            action: 'property.exported',
            entityType: 'property_export',
            entityId: format,
            clientIds: [],
          },
          {
            format: { before: null, after: format },
            count: { before: null, after: total },
            selection: { before: null, after: toAuditValue(selection) },
            owners: { before: null, after: includeOwners },
          },
        ),
      ),
    );

    return ok(
      this.deps.writer.write(format, this.batches(criteria.value, total, includeOwners), {
        generatedAt: now,
        includeOwners,
      }),
    );
  }

  private async *batches(
    criteria: PanelPropertyFilterCriteria,
    total: number,
    includeOwners: boolean,
  ): AsyncIterable<readonly PropertyExportRow[]> {
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const slice = await this.deps.list.search({
        ...criteria,
        sort: { field: 'code', direction: 'asc' },
        offset,
        limit: Math.min(BATCH_SIZE, total - offset),
      });
      if (slice.items.length === 0) return;
      yield await toExportRows(slice.items, this.deps, { includeOwners });
    }
  }
}
