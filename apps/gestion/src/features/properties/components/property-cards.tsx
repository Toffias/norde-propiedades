'use client';

import type { PanelPropertyRow } from '@norde/core/properties/contracts';
import { StatusPill } from '@norde/ui/components/status-pill';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import { HomeIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useListNavigation } from '../../shared/components/server-data-table';
import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { attributesSummary, operationsSummary, placeSummary, userName } from '../property-format';
import { FavoriteToggle } from './favorite-toggle';

function PropertyCard({
  row,
  favorite,
}: {
  readonly row: PanelPropertyRow;
  readonly favorite: boolean;
}) {
  const status = PROPERTY_STATUS_DISPLAY[row.status];
  const details = attributesSummary(row.attributes);
  return (
    <article className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/3] bg-muted">
        {row.coverImageUrl === undefined ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <HomeIcon className="h-8 w-8" aria-hidden />
            <span className="sr-only">Sin fotos</span>
          </div>
        ) : (
          // Las fotos vienen del storage (o de la importación): sin optimización de Next.
          // eslint-disable-next-line @next/next/no-img-element -- dominio de las fotos variable
          <img
            src={row.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        <StatusPill tone={status.tone} className="absolute top-2 left-2 shadow-sm">
          {status.label}
        </StatusPill>
        <div className="absolute top-1 right-1 rounded-md bg-card/90">
          <FavoriteToggle propertyId={row.id} code={row.code} favorite={favorite} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {row.code} · {PROPERTY_TYPE_LABELS[row.propertyType]}
        </span>
        <h3 className="line-clamp-2 text-sm font-semibold" title={row.portalTitle}>
          {row.portalTitle}
        </h3>
        <p className="truncate text-xs text-muted-foreground">{placeSummary(row)}</p>
        <p className="mt-1 text-sm font-medium tabular-nums">{operationsSummary(row.operations)}</p>
        {details !== '' && <p className="text-xs text-muted-foreground">{details}</p>}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">
          Captador: {userName(row.producer)}
        </p>
      </div>
    </article>
  );
}

/** Vista de tarjetas del buscador: la misma página de resultados, con foto y lo principal. */
export function PropertyCards({
  rows,
  total,
  page,
  pageSize,
  favoriteIds,
  toolbar,
  empty,
}: {
  readonly rows: readonly PanelPropertyRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly favoriteIds: ReadonlySet<string>;
  readonly toolbar: ReactNode;
  readonly empty: string;
}) {
  const { setParams, pending } = useListNavigation();
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {toolbar}
      </div>
      {rows.length === 0 ? (
        <div className="p-5 text-sm leading-normal text-muted-foreground">{empty}</div>
      ) : (
        <>
          <ul
            aria-label="Propiedades"
            aria-busy={pending}
            className={cn(
              'grid grid-cols-1 gap-4 p-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
              pending && 'opacity-60',
            )}
          >
            {rows.map((row) => (
              <li key={row.id} className="flex">
                <PropertyCard row={row} favorite={favoriteIds.has(row.id)} />
              </li>
            ))}
          </ul>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(next) => {
              setParams({ page: next });
            }}
            onPageSizeChange={(next) => {
              setParams({ pageSize: next });
            }}
          />
        </>
      )}
    </div>
  );
}
