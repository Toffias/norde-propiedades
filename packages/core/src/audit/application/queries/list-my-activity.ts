import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Permission,
  type Result,
} from '../../../shared';
import {
  ListMyActivityQuerySchema,
  type ActivityEntryRow,
  type ListMyActivityQuery,
} from '../../contracts';
import { activityAreaOf, activityEntityTypes, type ActivityArea } from '../../domain/activity';
import type { ActorActivityQuery, ActorActivityRecord } from '../ports/actor-activity-query';

export interface InvalidActivityQueryError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

export type ListMyActivityError = ForbiddenError | InvalidActivityQueryError;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/** El permiso para ver el nombre y el diff de una entidad de cada área. */
const AREA_READ: Readonly<Record<Exclude<ActivityArea, 'other'>, Permission>> = {
  properties: 'properties:read',
  developments: 'developments:read',
  clients: 'clients:read',
  opportunities: 'opportunities:read',
  appraisals: 'appraisals:read',
  users: 'users:read',
};

/**
 * Lo que hizo quien mira es suyo, pero el nombre y los datos de la entidad no: si ya no puede leer
 * esa área (le cambiaron el rol), la entrada queda sin entidad ni diff. Su propia cuenta la ve siempre.
 */
function canSeeDetails(record: ActorActivityRecord, area: ActivityArea, actor: Actor): boolean {
  if (area === 'other') return true;
  if (area === 'users' && record.entityId === actor.id) return true;
  return actor.can(AREA_READ[area]);
}

/**
 * Mi cuenta: el historial de quien mira, todo lo que hizo (altas, ediciones, bajas, ingresos y
 * exportaciones), de lo más nuevo a lo más viejo y paginado en la base. Cualquier usuario ve el suyo,
 * sin permisos; un actor de sistema no tiene cuenta.
 */
export class ListMyActivity {
  constructor(private readonly deps: { readonly activity: ActorActivityQuery }) {}

  async execute(
    input: ListMyActivityQuery,
    actor: Actor,
  ): Promise<Result<Page<ActivityEntryRow>, ListMyActivityError>> {
    if (actor.kind !== 'user') return err({ type: 'Forbidden' });
    const parsed = ListMyActivityQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({
        type: 'InvalidInput',
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    const { page, pageSize, area, from, to, sort } = parsed.data;

    const slice = await this.deps.activity.list({
      actorId: actor.id,
      entityTypes: area === undefined ? undefined : activityEntityTypes(area),
      from: from === undefined ? undefined : startOfDay(from),
      to: to === undefined ? undefined : new Date(startOfDay(to).getTime() + DAY_MS),
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = slice.items.map((record): ActivityEntryRow => {
      const entryArea = activityAreaOf(record.entityType);
      const visible = canSeeDetails(record, entryArea, actor);
      return {
        id: record.id,
        occurredAt: record.occurredAt,
        action: record.action,
        area: entryArea,
        entityType: record.entityType,
        entityId: record.entityId,
        entity: visible ? record.entity : undefined,
        changes: visible ? record.changes : {},
      };
    });
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
