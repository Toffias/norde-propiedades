import type { AuditHistoryQuery, HistoryEntryRow } from '../../../audit';
import { OWNERSHIP_RULES } from '../../../identity';
import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import { ListAppraisalHistoryQuerySchema, type ListAppraisalHistoryQuery } from '../../contracts';
import {
  canActOnAppraisal,
  invalidInput,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';

export type ListAppraisalHistoryError = ForbiddenError | InvalidInputError | AppraisalNotFoundError;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/**
 * El historial de una tasación: quién cambió qué y cuándo, paginado y filtrable por autor y
 * fechas. El de lo propio pide `audit:read`; el de otros, `audit:read-others`.
 */
export class ListAppraisalHistory {
  constructor(
    private readonly deps: {
      readonly appraisals: AppraisalQuery;
      readonly history: AuditHistoryQuery;
      readonly directory: PanelDirectory;
    },
  ) {}

  async execute(
    input: ListAppraisalHistoryQuery,
    actor: Actor,
  ): Promise<Result<Page<HistoryEntryRow>, ListAppraisalHistoryError>> {
    const rule = OWNERSHIP_RULES.auditRead;
    if (!actor.can('appraisals:read') || !(actor.can(rule.own) || actor.can(rule.all))) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListAppraisalHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const appraisal = await this.deps.appraisals.findDetail(query.appraisalId);
    if (!appraisal || !canActOnAppraisal(actor, OWNERSHIP_RULES.appraisalsRead, appraisal)) {
      return err({ type: 'AppraisalNotFound' });
    }
    if (!canActOnAppraisal(actor, rule, appraisal)) return err({ type: 'Forbidden' });

    const { page, pageSize } = query;
    const slice = await this.deps.history.list({
      entityType: 'appraisal',
      entityId: appraisal.id,
      actions: undefined,
      fields: undefined,
      actorId: query.actorId,
      from: query.from === undefined ? undefined : startOfDay(query.from),
      to: query.to === undefined ? undefined : new Date(startOfDay(query.to).getTime() + DAY_MS),
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.directory.names('user', [
      ...new Set(slice.items.map((entry) => entry.actorId)),
    ]);
    const items = slice.items.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      actor: { id: entry.actorId, name: names.get(entry.actorId) },
      source: entry.source,
      action: entry.action,
      changes: entry.changes,
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
