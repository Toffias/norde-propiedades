import { OWNERSHIP_RULES, visibilityFilter } from '../../identity';
import type { Actor } from '../../shared';
import type { ParsedAppraisalFilter } from '../contracts';
import { statusesOfGroup } from '../domain/appraisal-status';

import type { AppraisalFilterCriteria } from './ports/appraisal-query';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/** `[desde, hasta)` en instantes UTC, con "hasta" inclusive. */
function dayRange(from: string | undefined, to: string | undefined) {
  return {
    from: from === undefined ? undefined : startOfDay(from),
    to: to === undefined ? undefined : new Date(startOfDay(to).getTime() + DAY_MS),
  };
}

/** Los filtros ya validados del listado (o de la exportación), más lo que el actor puede ver. */
export function appraisalCriteria(
  filter: ParsedAppraisalFilter,
  actor: Actor,
): AppraisalFilterCriteria {
  return {
    visibility: visibilityFilter(actor, OWNERSHIP_RULES.appraisalsRead),
    deleted: filter.view === 'trash',
    // Los estados de todos los grupos elegidos.
    statuses:
      filter.status === undefined
        ? undefined
        : filter.status.flatMap((group) => statusesOfGroup(group)),
    propertyType: filter.propertyType,
    producerUserId: filter.producerId,
    appraiserUserId: filter.appraiserId,
    branchId: filter.branchId,
    created: dayRange(filter.createdFrom, filter.createdTo),
    visit: dayRange(filter.visitFrom, filter.visitTo),
  };
}
