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
  ExportAppraisalsInputSchema,
  MAX_APPRAISAL_EXPORT_ROWS,
  type AppraisalExportRow,
  type ExportAppraisalsInput,
} from '../../contracts';
import { appraisalCriteria } from '../appraisal-filter';
import { withNames } from '../appraisal-rows';
import { invalidInput, type InvalidInputError } from '../appraisal-support';
import type { AppraisalExportFile, AppraisalExportWriter } from '../ports/appraisal-export-writer';
import type { AppraisalFilterCriteria, AppraisalQuery } from '../ports/appraisal-query';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';
import type { PanelDirectory } from '../ports/panel-directory';

export type ExportAppraisalsError =
  | ForbiddenError
  | InvalidInputError
  | { readonly type: 'NothingToExport' }
  | { readonly type: 'TooManyToExport'; readonly max: number; readonly total: number };

/** Filas por consulta: la planilla se arma de a lotes, sin cargar todo en memoria. */
const BATCH_SIZE = 500;

/**
 * Exporta a Excel las tasaciones que cumplen los filtros, con los valores tasados. Pide
 * `appraisals:export` y respeta lo que el usuario puede ver (sin "Ver tasaciones de otros", solo las
 * suyas). Queda en la auditoría con los filtros y la cantidad.
 */
export class ExportAppraisals {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly appraisals: AppraisalQuery;
      readonly directory: PanelDirectory;
      readonly writer: AppraisalExportWriter;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ExportAppraisalsInput,
    actor: Actor,
  ): Promise<Result<AppraisalExportFile, ExportAppraisalsError>> {
    if (!actor.can('appraisals:read') || !actor.can('appraisals:export')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ExportAppraisalsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { filter } = parsed.data;
    if (filter.view === 'trash' && !actor.can('appraisals:delete')) {
      return err({ type: 'Forbidden' });
    }
    const criteria = appraisalCriteria(filter, actor);

    const { total } = await this.deps.appraisals.search({
      ...criteria,
      sort: { field: 'code', direction: 'asc' },
      offset: 0,
      limit: 1,
    });
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > MAX_APPRAISAL_EXPORT_ROWS) {
      return err({ type: 'TooManyToExport', max: MAX_APPRAISAL_EXPORT_ROWS, total });
    }

    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          {
            action: 'appraisal.exported',
            entityType: 'appraisal_export',
            entityId: 'xlsx',
            clientIds: [],
          },
          {
            count: { before: null, after: total },
            filter: { before: null, after: toAuditValue(parsed.data.filter) },
          },
        ),
      ),
    );

    return ok(this.deps.writer.write(this.batches(criteria, total), { generatedAt: now }));
  }

  private async *batches(
    criteria: AppraisalFilterCriteria,
    total: number,
  ): AsyncIterable<readonly AppraisalExportRow[]> {
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const items = await this.deps.appraisals.exportRows({
        ...criteria,
        sort: { field: 'code', direction: 'asc' },
        offset,
        limit: Math.min(BATCH_SIZE, total - offset),
      });
      if (items.length === 0) return;
      yield await withNames(this.deps.directory, items);
    }
  }
}
