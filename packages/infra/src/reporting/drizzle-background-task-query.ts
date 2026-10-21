import type {
  BackgroundTaskCriteria,
  BackgroundTaskQuery,
  BackgroundTaskRecord,
} from '@norde/core/reporting';
import { FINISHED_TASKS_WINDOW_DAYS } from '@norde/core/reporting';
import {
  BACKGROUND_TASK_KINDS,
  BACKGROUND_TASK_STATUSES,
  type BackgroundTaskSubject,
} from '@norde/core/reporting/contracts';
import type { SortDirection } from '@norde/core/shared/contracts';
import type { PageSlice } from '@norde/core/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  developments,
  importJobs,
  mediaItems,
  opportunityBulkOperations,
  portalListings,
  properties,
  propertyDocuments,
} from '../db/schema';

const count = z.coerce.number().int().min(0);
const TaskRow = z.object({
  kind: z.enum(BACKGROUND_TASK_KINDS),
  id: z.string(),
  source_id: z.string(),
  status: z.enum(BACKGROUND_TASK_STATUSES),
  property_id: z.string().nullable(),
  property_code: z.string().nullable(),
  property_title: z.string().nullable(),
  development_id: z.string().nullable(),
  development_name: z.string().nullable(),
  detail: z.string().nullable(),
  done: count.nullable(),
  total: count.nullable(),
  problems: count,
  failure: z.string().nullable(),
  requester_id: z.string(),
  created_at: z.coerce.date(),
  finished_at: z.coerce.date().nullable(),
});
type TaskRow = z.infer<typeof TaskRow>;
const CountRow = z.object({ total: z.coerce.number() });

/** Las corridas de `import_jobs` de cada tipo, con el nombre que tienen en la lista. */
const IMPORT_KINDS = sql`case j.kind
  when 'clients_xlsx' then 'client_import'
  when 'properties_tokko' then 'property_import'
  when 'units_xlsx' then 'unit_import'
  when 'tokko_users' then 'tokko_users_import'
end`;

function subject(row: TaskRow): BackgroundTaskSubject | undefined {
  if (row.property_id !== null && row.property_code !== null) {
    return {
      kind: 'property',
      id: row.property_id,
      code: row.property_code,
      title: row.property_title ?? '',
    };
  }
  if (row.development_id !== null && row.development_name !== null) {
    return { kind: 'development', id: row.development_id, name: row.development_name };
  }
  return undefined;
}

function toRecord(row: TaskRow): BackgroundTaskRecord {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.source_id,
    status: row.status,
    subject: subject(row),
    detail: row.detail ?? undefined,
    progress:
      row.done === null || row.total === null || row.total === 0
        ? undefined
        : { done: Math.min(row.done, row.total), total: row.total },
    problems: row.problems,
    failure: row.failure ?? undefined,
    requesterId: row.requester_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

/**
 * Los procesos en segundo plano, leídos de las tablas que dejan los jobs (ADR 0040). Cada origen es
 * un `select` con las mismas columnas y se juntan con `union all`; cada filtro usa un índice de su
 * tabla (los en curso, por quien los pidió; los terminados, por fecha).
 */
export class DrizzleBackgroundTaskQuery implements BackgroundTaskQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(
    criteria: BackgroundTaskCriteria,
    request: { readonly direction: SortDirection; readonly offset: number; readonly limit: number },
  ): Promise<PageSlice<BackgroundTaskRecord>> {
    const tasks = this.#tasks(criteria);
    const order = request.direction === 'asc' ? sql`asc` : sql`desc`;
    const [rows, totals] = await Promise.all([
      this.db.execute(sql`
        select t.*, p.code as property_code,
          coalesce(p.portal_title, p.title) as property_title,
          d.name as development_name
        from (${tasks}) t
        left join ${properties} p on p.id = t.property_id::uuid
        left join ${developments} d on d.id = t.development_id::uuid
        order by (t.status in ('pending', 'running')) desc,
          coalesce(t.finished_at, t.created_at) ${order}, t.id ${order}
        limit ${request.limit} offset ${request.offset}
      `),
      this.db.execute(sql`select count(*) as total from (${tasks}) t`),
    ]);
    return {
      items: rows.rows.map((raw) => toRecord(TaskRow.parse(raw))),
      total: CountRow.parse(totals.rows[0] ?? { total: 0 }).total,
    };
  }

  async countActive(criteria: BackgroundTaskCriteria): Promise<number> {
    const result = await this.db.execute(sql`
      select count(*) as total from (${this.#tasks(criteria)}) t
      where t.status in ('pending', 'running')
    `);
    return CountRow.parse(result.rows[0] ?? { total: 0 }).total;
  }

  #tasks(criteria: BackgroundTaskCriteria): SQL {
    // Como texto ISO: un `Date` en un `sql` crudo viaja con la zona horaria del proceso.
    const since = criteria.finishedSince.toISOString();
    const by = (column: SQL) =>
      criteria.requesterId === undefined ? sql`true` : sql`${column} = ${criteria.requesterId}`;
    const sources = [
      // Las fotos y planos de una ficha que subió una persona, agrupados. Las terminadas: subidas
      // hasta una semana antes de `since` y terminadas después. Las de una importación van aparte.
      sql`
        select 'media_variants' as kind,
          'media_variants:' || coalesce(m.property_id, m.development_id)::text || ':' || m.uploaded_by as id,
          coalesce(m.property_id, m.development_id)::text as source_id,
          case
            when count(*) filter (where m.processing_status = 'pending') > 0 then 'running'
            when count(*) filter (where m.processing_status = 'failed') > 0 then 'failed'
            else 'done'
          end as status,
          m.property_id::text as property_id, m.development_id::text as development_id,
          null::text as detail,
          count(*) filter (where m.processing_status <> 'pending') as done,
          count(*) as total,
          count(*) filter (where m.processing_status = 'failed') as problems,
          null::text as failure, m.uploaded_by as requester_id,
          min(m.created_at) as created_at,
          case when count(*) filter (where m.processing_status = 'pending') = 0
            then max(m.updated_at) end as finished_at
        from ${mediaItems} m
        where ${by(sql`m.uploaded_by`)}
          and m.import_id is null
          and m.kind in ('photo', 'floor_plan')
          and (m.processing_status = 'pending'
            or m.created_at > ${since}::timestamptz - make_interval(days => ${FINISHED_TASKS_WINDOW_DAYS}::int))
        group by m.property_id, m.development_id, m.uploaded_by
        having count(*) filter (where m.processing_status = 'pending') > 0
          or max(m.updated_at) > ${since}::timestamptz
      `,
      // Las fotos que trajo una importación (la de Tokko), todas juntas y a nombre de quien la
      // pidió: se siguen generando después de que la importación termina.
      sql`
        select 'import_media' as kind, 'import_media:' || j.id::text as id,
          j.id::text as source_id,
          case
            when count(*) filter (where m.processing_status = 'pending') > 0 then 'running'
            when count(*) filter (where m.processing_status = 'failed') > 0 then 'failed'
            else 'done'
          end as status,
          null::text as property_id, null::text as development_id, null::text as detail,
          count(*) filter (where m.processing_status <> 'pending') as done,
          count(*) as total,
          count(*) filter (where m.processing_status = 'failed') as problems,
          null::text as failure, j.created_by as requester_id,
          min(m.created_at) as created_at,
          case when count(*) filter (where m.processing_status = 'pending') = 0
            then max(m.updated_at) end as finished_at
        from ${importJobs} j
        join ${mediaItems} m on m.import_id = j.id
        where ${by(sql`j.created_by`)}
          and m.kind in ('photo', 'floor_plan')
          and (m.processing_status = 'pending'
            or m.created_at > ${since}::timestamptz - make_interval(days => ${FINISHED_TASKS_WINDOW_DAYS}::int))
        group by j.id, j.created_by
        having count(*) filter (where m.processing_status = 'pending') > 0
          or max(m.updated_at) > ${since}::timestamptz
      `,
      sql`
        select ${IMPORT_KINDS} as kind, 'import:' || j.id::text as id, j.id::text as source_id,
          j.status, null::text as property_id,
          case when j.kind = 'units_xlsx' then j.options ->> 'developmentId' end as development_id,
          case when j.options ->> 'source' = 'api' then 'api' else j.file_name end as detail,
          (j.totals ->> 'processed')::int as done, (j.totals ->> 'rows')::int as total,
          coalesce((j.totals ->> 'failed')::int, (j.totals ->> 'skipped')::int, 0) as problems,
          j.failure, j.created_by as requester_id, j.created_at, j.finished_at
        from ${importJobs} j
        where ${by(sql`j.created_by`)}
          and j.kind in ('clients_xlsx', 'properties_tokko', 'units_xlsx', 'tokko_users')
          and (j.status in ('pending', 'running') or j.updated_at > ${since}::timestamptz)
      `,
      sql`
        select 'opportunity_bulk' as kind, 'bulk:' || o.id::text as id, o.id::text as source_id,
          o.status, null::text as property_id, null::text as development_id,
          o.action ->> 'kind' as detail,
          (o.totals ->> 'processed')::int as done, (o.totals ->> 'total')::int as total,
          coalesce((o.totals ->> 'skippedCount')::int, 0) as problems,
          o.failure, o.requested_by as requester_id, o.created_at, o.finished_at
        from ${opportunityBulkOperations} o
        where ${by(sql`o.requested_by`)}
          and (o.status in ('pending', 'running') or o.updated_at > ${since}::timestamptz)
      `,
      sql`
        select 'property_document' as kind, 'document:' || pd.id::text as id,
          pd.id::text as source_id,
          case pd.status when 'pending' then 'running' when 'ready' then 'done' else 'failed' end
            as status,
          pd.property_id::text as property_id, null::text as development_id, pd.kind as detail,
          null::int as done, null::int as total, 0 as problems, pd.error as failure,
          pd.requested_by as requester_id, pd.created_at,
          case when pd.status <> 'pending' then pd.updated_at end as finished_at
        from ${propertyDocuments} pd
        where ${by(sql`pd.requested_by`)}
          and (pd.status = 'pending' or pd.updated_at > ${since}::timestamptz)
      `,
    ];
    if (criteria.includePortals) {
      sources.push(sql`
        select 'portal_listing' as kind, 'listing:' || pl.id::text as id, pl.id::text as source_id,
          case pl.status when 'pending' then 'running' when 'error' then 'failed' else 'done' end
            as status,
          pl.property_id::text as property_id, pl.development_id::text as development_id,
          pl.portal as detail, null::int as done, null::int as total, 0 as problems,
          pl.last_error as failure, pl.updated_by as requester_id, pl.created_at,
          case when pl.status <> 'pending' then coalesce(pl.last_synced_at, pl.updated_at) end
            as finished_at
        from ${portalListings} pl
        where pl.status = 'pending' or pl.updated_at > ${since}::timestamptz
      `);
    }
    return sql.join(sources, sql` union all `);
  }
}
