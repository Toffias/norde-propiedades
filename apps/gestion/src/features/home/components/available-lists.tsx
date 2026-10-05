'use client';

import type {
  AvailableDevelopmentRow,
  AvailablePropertyRow,
} from '@norde/core/reporting/contracts';
import { HOME_LIST_PAGE_SIZE } from '@norde/core/reporting/contracts';
import type { Page } from '@norde/core/shared';
import { Card } from '@norde/ui/components/card';
import { DataTable, type DataTableColumn } from '@norde/ui/components/data-table';
import type { Route } from 'next';
import Link from 'next/link';

import { EMPTY_VALUE, formatMoney } from '../../../lib/format';
import { CONSTRUCTION_STATUS_LABELS } from '../../developments/labels';
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../../properties/labels';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { DEVELOPMENTS_PAGE_PARAM, PROPERTIES_PAGE_PARAM } from '../home-params';

function prices(row: AvailablePropertyRow): string {
  if (row.operations.length === 0) return EMPTY_VALUE;
  return row.operations
    .map((operation) => {
      const price =
        operation.priceCents === null
          ? 'a consultar'
          : formatMoney({ currency: operation.currency, amountCents: operation.priceCents });
      return `${OPERATION_LABELS[operation.operation]} ${price}`;
    })
    .join(' · ');
}

const PROPERTY_COLUMNS: readonly DataTableColumn<AvailablePropertyRow>[] = [
  {
    id: 'code',
    header: 'Propiedad',
    cell: (row) => (
      <Link
        href={`/propiedades/${row.id}` as Route}
        className="flex min-w-0 flex-col underline-offset-4 hover:underline"
      >
        <span className="font-medium">{row.code}</span>
        <span className="truncate text-xs text-muted-foreground">{row.title}</span>
      </Link>
    ),
  },
  {
    id: 'type',
    header: 'Tipo',
    showFrom: 'md',
    cell: (row) => `${PROPERTY_TYPE_LABELS[row.propertyType]} · ${row.neighborhood}`,
  },
  { id: 'price', header: 'Precio', showFrom: 'lg', cell: prices },
  {
    id: 'agent',
    header: 'Captador',
    showFrom: 'md',
    className: 'text-muted-foreground',
    cell: (row) => row.agent?.name ?? EMPTY_VALUE,
  },
];

const DEVELOPMENT_COLUMNS: readonly DataTableColumn<AvailableDevelopmentRow>[] = [
  {
    id: 'code',
    header: 'Emprendimiento',
    cell: (row) => (
      <Link
        href={`/emprendimientos/${row.id}` as Route}
        className="flex min-w-0 flex-col underline-offset-4 hover:underline"
      >
        <span className="font-medium">{row.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {row.code}
          {row.address === undefined ? '' : ` · ${row.address}`}
        </span>
      </Link>
    ),
  },
  {
    id: 'construction',
    header: 'Estado de obra',
    showFrom: 'md',
    cell: (row) =>
      row.constructionStatus === undefined
        ? EMPTY_VALUE
        : CONSTRUCTION_STATUS_LABELS[row.constructionStatus],
  },
  {
    id: 'units',
    header: 'Unidades disponibles',
    className: 'text-right tabular-nums',
    cell: (row) => row.availableUnits,
  },
  {
    id: 'agent',
    header: 'Captador',
    showFrom: 'lg',
    className: 'text-muted-foreground',
    cell: (row) => row.agent?.name ?? EMPTY_VALUE,
  },
];

function PagedList<T extends { readonly id: string }>({
  title,
  page,
  param,
  columns,
  empty,
}: {
  readonly title: string;
  readonly page: Page<T>;
  readonly param: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly empty: string;
}) {
  const { setParams, pending } = useListNavigation();
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <h2 className="border-b border-border px-5 py-4 text-base font-bold">
        {title} ({page.total})
      </h2>
      <DataTable
        label={title}
        columns={columns}
        rows={page.items}
        getRowId={(row) => row.id}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        pageSizes={[HOME_LIST_PAGE_SIZE]}
        pending={pending}
        onPageChange={(next) => {
          setParams({ [param]: next === 1 ? undefined : next });
        }}
        onPageSizeChange={() => undefined}
        empty={empty}
      />
    </Card>
  );
}

export function AvailablePropertiesList({ page }: { readonly page: Page<AvailablePropertyRow> }) {
  return (
    <ListNavigationProvider>
      <PagedList
        title="Propiedades disponibles"
        page={page}
        param={PROPERTIES_PAGE_PARAM}
        columns={PROPERTY_COLUMNS}
        empty="No hay propiedades disponibles."
      />
    </ListNavigationProvider>
  );
}

export function AvailableDevelopmentsList({
  page,
}: {
  readonly page: Page<AvailableDevelopmentRow>;
}) {
  return (
    <ListNavigationProvider>
      <PagedList
        title="Emprendimientos disponibles"
        page={page}
        param={DEVELOPMENTS_PAGE_PARAM}
        columns={DEVELOPMENT_COLUMNS}
        empty="No hay emprendimientos en comercialización."
      />
    </ListNavigationProvider>
  );
}
