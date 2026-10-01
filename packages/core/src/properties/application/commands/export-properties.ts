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
  MAX_PDF_EXPORT_ROWS,
  type ExportPropertiesInput,
  type PanelPropertyRow,
} from '../../contracts';
import { resolveSelection, toPanelRows, type NoBranchAssignedError } from '../panel-filter';
import type {
  PanelPropertyFilterCriteria,
  PanelPropertyListQuery,
} from '../ports/panel-property-list-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ExportFile, PropertyExportWriter } from '../ports/property-export-writer';
import type { UserNames } from '../ports/user-names';
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
 * Exporta las propiedades seleccionadas (las marcadas o todas las que cumplen el filtro) a CSV,
 * Excel o PDF. Hasta 10 alcanza con `properties:export`; más, hace falta `properties:export-bulk`.
 * La exportación queda en la auditoría con el filtro y la cantidad. No incluye la dirección
 * privada (calle y altura): sale la dirección para publicar.
 */
export class ExportProperties {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly list: PanelPropertyListQuery;
      readonly users: UserNames;
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
    const max = format === 'pdf' ? MAX_PDF_EXPORT_ROWS : MAX_EXPORT_ROWS;
    if (total > max) return err({ type: 'TooManyToExport', max, total });

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
          },
        ),
      ),
    );

    return ok(
      this.deps.writer.write(format, this.batches(criteria.value, total), { generatedAt: now }),
    );
  }

  private async *batches(
    criteria: PanelPropertyFilterCriteria,
    total: number,
  ): AsyncIterable<readonly PanelPropertyRow[]> {
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const slice = await this.deps.list.search({
        ...criteria,
        sort: { field: 'code', direction: 'asc' },
        offset,
        limit: Math.min(BATCH_SIZE, total - offset),
      });
      if (slice.items.length === 0) return;
      yield await toPanelRows(slice.items, this.deps.users);
    }
  }
}
