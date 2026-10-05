import {
  APPRAISAL_CONDITIONS,
  APPRAISAL_PROPERTY_TYPES,
  APPRAISAL_SOURCES,
  APPRAISAL_STATUSES,
  MAX_APPRAISAL_PHOTOS,
  type AppraisalDetailItem,
  type AppraisalFilterCriteria,
  type AppraisalQuery,
  type AppraisalSearchItem,
} from '@norde/core/appraisals';
import type { AppraisalSortField } from '@norde/core/appraisals/contracts';
import type { VisibilityFilter } from '@norde/core/identity';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { appraisalPhotos, appraisals, clients, properties } from '../db/schema';

import { resultFromRow } from './appraisal-result-columns';

const StatusSchema = z.enum(APPRAISAL_STATUSES);
const SourceSchema = z.enum(APPRAISAL_SOURCES);
const PropertyTypeSchema = z.enum(APPRAISAL_PROPERTY_TYPES);
const ConditionSchema = z.enum(APPRAISAL_CONDITIONS);

const SORT_COLUMNS = {
  createdAt: appraisals.createdAt,
  visitAt: appraisals.visitAt,
  code: appraisals.code,
} as const satisfies Record<AppraisalSortField, unknown>;

/** Lo que el actor puede ver: las que produce o tasa, las de su sucursal o todas. */
function visibleAppraisals(visibility: VisibilityFilter): SQL {
  switch (visibility.kind) {
    case 'all':
      return sql`true`;
    case 'own':
      return (
        or(
          eq(appraisals.producerUserId, visibility.ownerId),
          eq(appraisals.appraiserUserId, visibility.ownerId),
        ) ?? sql`false`
      );
    case 'branch':
      return (
        or(
          eq(appraisals.producerUserId, visibility.ownerId),
          eq(appraisals.appraiserUserId, visibility.ownerId),
          eq(appraisals.branchId, visibility.branchId),
        ) ?? sql`false`
      );
    case 'none':
      return sql`false`;
  }
}

function conditions(c: AppraisalFilterCriteria): SQL | undefined {
  const parts: (SQL | undefined)[] = [
    visibleAppraisals(c.visibility),
    c.deleted ? isNotNull(appraisals.deletedAt) : isNull(appraisals.deletedAt),
    c.statuses === undefined ? undefined : inArray(appraisals.status, [...c.statuses]),
    c.propertyType === undefined ? undefined : eq(appraisals.propertyType, c.propertyType),
    c.producerUserId === undefined ? undefined : eq(appraisals.producerUserId, c.producerUserId),
    c.appraiserUserId === undefined ? undefined : eq(appraisals.appraiserUserId, c.appraiserUserId),
    c.branchId === undefined ? undefined : eq(appraisals.branchId, c.branchId),
    c.created.from === undefined ? undefined : gte(appraisals.createdAt, c.created.from),
    c.created.to === undefined ? undefined : lt(appraisals.createdAt, c.created.to),
    c.visit.from === undefined ? undefined : gte(appraisals.visitAt, c.visit.from),
    c.visit.to === undefined ? undefined : lt(appraisals.visitAt, c.visit.to),
  ];
  return and(...parts);
}

const COLUMNS = {
  appraisal: appraisals,
  /** `null` si el contacto ya no está (papelera o supresión). */
  requesterName: sql<
    string | null
  >`case when ${clients.id} is null then null else coalesce(${clients.name}, ${clients.companyName}, 'Sin nombre') end`,
  /**
   * La primera foto (índice `appraisal_photos_appraisal_position_idx`). La columna va calificada:
   * dentro de la subconsulta, `id` apuntaría a la foto.
   */
  coverPhotoId: sql<string | null>`(
    select p.id from ${appraisalPhotos} p
    where p.appraisal_id = ${sql.raw('"appraisals"."id"')}
    order by p.position asc, p.id asc
    limit 1
  )`,
};

interface Row {
  readonly appraisal: typeof appraisals.$inferSelect;
  readonly requesterName: string | null;
  readonly coverPhotoId: string | null;
}

function toSearchItem(row: Row): AppraisalSearchItem {
  const a = row.appraisal;
  // Las tasaciones del panel siempre tienen solicitante y productor; una sin ellos es un bug.
  if (a.requesterClientId === null || a.producerUserId === null) {
    throw new Error(`Appraisal ${a.id} without requester or producer`);
  }
  return {
    id: a.id,
    code: a.code,
    status: StatusSchema.parse(a.status),
    propertyType: PropertyTypeSchema.parse(a.propertyType),
    address: a.address ?? undefined,
    coverPhotoId: row.coverPhotoId ?? undefined,
    requesterClientId: a.requesterClientId,
    requesterName: row.requesterName ?? undefined,
    producerUserId: a.producerUserId,
    appraiserUserId: a.appraiserUserId ?? undefined,
    branchId: a.branchId ?? undefined,
    visitAt: a.visitAt ?? undefined,
    createdAt: a.createdAt,
    deletedAt: a.deletedAt ?? undefined,
  };
}

function toDetail(
  row: Row & { readonly convertedPropertyCode: string | null },
  photoIds: readonly string[],
): AppraisalDetailItem {
  const a = row.appraisal;
  const { sale, rent, comparables, observations } = resultFromRow(a);
  return {
    ...toSearchItem(row),
    source: SourceSchema.parse(a.source),
    surfaceTotalM2: a.surfaceTotalM2 ?? undefined,
    surfaceCoveredM2: a.surfaceCoveredM2 ?? undefined,
    rooms: a.rooms ?? undefined,
    bedrooms: a.bedrooms ?? undefined,
    bathrooms: a.bathrooms ?? undefined,
    condition: a.condition === null ? undefined : ConditionSchema.parse(a.condition),
    statusChangedAt: a.statusChangedAt ?? undefined,
    updatedAt: a.updatedAt,
    result: {
      sale,
      rent,
      observations,
      comparables: comparables.map((comparable) => ({
        address: comparable.address,
        price: { amountCents: comparable.priceCents, currency: comparable.currency },
        surfaceM2: comparable.surfaceM2,
        url: comparable.url,
        note: comparable.note,
      })),
    },
    photoIds,
    convertedProperty:
      a.convertedPropertyId === null
        ? undefined
        : { id: a.convertedPropertyId, code: row.convertedPropertyCode ?? undefined },
  };
}

/**
 * El listado de `/tasaciones` y la ficha. Cada filtro y orden tiene índice (`appraisals_*_idx`). El
 * nombre del solicitante sale de `clients` en la misma consulta, solo para mostrarlo.
 */
export class DrizzleAppraisalQuery implements AppraisalQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(
    query: AppraisalFilterCriteria & {
      readonly sort: { readonly field: AppraisalSortField; readonly direction: 'asc' | 'desc' };
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<AppraisalSearchItem>> {
    const order = query.sort.direction === 'asc' ? asc : desc;
    const where = conditions(query);
    const [rows, [total]] = await Promise.all([
      this.db
        .select(COLUMNS)
        .from(appraisals)
        .leftJoin(
          clients,
          and(eq(clients.id, appraisals.requesterClientId), isNull(clients.deletedAt)),
        )
        .where(where)
        .orderBy(sql`${order(SORT_COLUMNS[query.sort.field])} nulls last`, order(appraisals.id))
        .offset(query.offset)
        .limit(query.limit),
      this.db.select({ total: count() }).from(appraisals).where(where),
    ]);
    return { items: rows.map(toSearchItem), total: total?.total ?? 0 };
  }

  async findDetail(appraisalId: string): Promise<AppraisalDetailItem | undefined> {
    const [[row], photos] = await Promise.all([
      this.db
        .select({ ...COLUMNS, convertedPropertyCode: properties.code })
        .from(appraisals)
        .leftJoin(
          clients,
          and(eq(clients.id, appraisals.requesterClientId), isNull(clients.deletedAt)),
        )
        // La propiedad en la que se convirtió, solo para mostrar su código (no existe hasta que
        // properties procesa la conversión).
        .leftJoin(properties, eq(properties.id, appraisals.convertedPropertyId))
        .where(eq(appraisals.id, appraisalId))
        .limit(1),
      this.db
        .select({ id: appraisalPhotos.id })
        .from(appraisalPhotos)
        .where(eq(appraisalPhotos.appraisalId, appraisalId))
        .orderBy(asc(appraisalPhotos.position), asc(appraisalPhotos.id))
        .limit(MAX_APPRAISAL_PHOTOS),
    ]);
    return (
      row &&
      toDetail(
        row,
        photos.map((photo) => photo.id),
      )
    );
  }
}
