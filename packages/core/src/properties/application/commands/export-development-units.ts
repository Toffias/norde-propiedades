import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  EXPORT_WITHOUT_BULK_PERMISSION,
  ExportDevelopmentUnitsInputSchema,
  MAX_EXPORT_ROWS,
  type ExportDevelopmentUnitsInput,
  type PanelPropertyRow,
} from '../../contracts';
import {
  developmentTarget,
  findDevelopment,
  type DevelopmentNotFoundError,
} from '../development-support';
import { idsCriteria, toPanelRows } from '../panel-filter';
import type { DevelopmentUnitsExportWriter } from '../ports/development-units-export-writer';
import type {
  PanelPropertyFilterCriteria,
  PanelPropertyListQuery,
} from '../ports/panel-property-list-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ExportFile } from '../ports/property-export-writer';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ExportDevelopmentUnitsError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | { readonly type: 'NothingToExport' }
  | { readonly type: 'TooManyToExport'; readonly max: number; readonly total: number };

/** Filas por consulta: la planilla se arma de a lotes, sin cargar todo en memoria. */
const BATCH_SIZE = 200;

/**
 * Exporta a Excel las unidades activas de un emprendimiento ("Descargar unidades"), con las
 * columnas que reconoce la importación. Unidades son propiedades: hasta 10 alcanza con
 * `properties:export`; más, hace falta `properties:export-bulk`. Queda en el historial del
 * emprendimiento con la cantidad.
 */
export class ExportDevelopmentUnits {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly list: PanelPropertyListQuery;
      readonly users: UserNames;
      readonly writer: DevelopmentUnitsExportWriter;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ExportDevelopmentUnitsInput,
    actor: Actor,
  ): Promise<Result<ExportFile, ExportDevelopmentUnitsError>> {
    const canExport = actor.can('properties:export') || actor.can('properties:export-bulk');
    if (!actor.can('developments:read') || !canExport) return err({ type: 'Forbidden' });
    const parsed = ExportDevelopmentUnitsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const development = await this.deps.uow.run((tx) =>
      findDevelopment(tx.developments, parsed.data.developmentId),
    );
    if (!development) return err({ type: 'DevelopmentNotFound' });

    const criteria: PanelPropertyFilterCriteria = {
      ...idsCriteria(undefined),
      developmentId: development.id,
    };
    const total = await this.deps.list.count(criteria);
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > EXPORT_WITHOUT_BULK_PERMISSION && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    if (total > MAX_EXPORT_ROWS) {
      return err({ type: 'TooManyToExport', max: MAX_EXPORT_ROWS, total });
    }

    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(actor, developmentTarget('development.units_exported', development), {
          count: { before: null, after: total },
        }),
      ),
    );

    return ok(
      this.deps.writer.write(this.batches(criteria, total), {
        developmentCode: development.toSnapshot().code,
        generatedAt: now,
      }),
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
