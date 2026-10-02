'use client';

import {
  OPERATIONS,
  PROPERTY_TYPES,
  type Operation,
  type PanelPropertyRow,
  type PropertyType,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn, DataTableSort } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { CheckIcon, Loader2Icon, SearchIcon, StarIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import {
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../../properties/labels';
import { operationsSummary, placeSummary } from '../../properties/property-format';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { featurePropertiesAction } from '../activity-actions';

const ANY = 'all';

export interface OfferFilters {
  readonly q: string | undefined;
  readonly operation: Operation | undefined;
  readonly propertyType: PropertyType | undefined;
}

function Toolbar({ filters }: { readonly filters: OfferFilters }) {
  const { setParams } = useListNavigation();
  return (
    <form
      className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const text = new FormData(event.currentTarget).get('q');
        setParams({ q: typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined });
      }}
    >
      <div className="relative w-full sm:w-72">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          name="q"
          type="search"
          defaultValue={filters.q ?? ''}
          placeholder="Código, título o dirección"
          aria-label="Buscar propiedades"
          className="pl-8"
        />
      </div>
      <Select
        value={filters.operation ?? ANY}
        onValueChange={(next) => {
          setParams({ operation: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[180px]" aria-label="Operación">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todas las operaciones</SelectItem>
          {OPERATIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {OPERATION_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.propertyType ?? ANY}
        onValueChange={(next) => {
          setParams({ propertyType: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[180px]" aria-label="Tipo de propiedad">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los tipos</SelectItem>
          {PROPERTY_TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {PROPERTY_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" className="sm:w-auto">
        Buscar
      </Button>
    </form>
  );
}

function FeatureButton({
  clientId,
  row,
  featured,
}: {
  readonly clientId: string;
  readonly row: PanelPropertyRow;
  readonly featured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (featured || done) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <CheckIcon className="h-4 w-4" aria-hidden />
        Destacada
      </span>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      aria-label={`Destacar ${row.code} para este contacto`}
      onClick={() => {
        startTransition(async () => {
          const message = await runAction(() =>
            featurePropertiesAction({ clientId, propertyIds: [row.id] }),
          );
          if (message !== undefined) {
            toast.error(message);
            return;
          }
          setDone(true);
          toast.success(`${row.code} destacada`);
        });
      }}
    >
      {pending ? (
        <Loader2Icon className="h-4 w-4 animate-spin" />
      ) : (
        <StarIcon className="h-4 w-4" />
      )}
      Destacar
    </Button>
  );
}

/**
 * El buscador de la cartera dentro de la ficha, para ofrecerle propiedades al contacto: cada fila
 * se destaca para él y pasa a su pestaña Destacadas.
 */
export function ClientOfferProperties({
  clientId,
  page,
  sort,
  filters,
  featuredIds,
  canFeature,
}: {
  readonly clientId: string;
  readonly page: Page<PanelPropertyRow>;
  readonly sort: DataTableSort;
  readonly filters: OfferFilters;
  readonly featuredIds: readonly string[];
  readonly canFeature: boolean;
}) {
  const featured = new Set(featuredIds);
  const columns: readonly DataTableColumn<PanelPropertyRow>[] = [
    {
      id: 'code',
      header: 'Propiedad',
      sortable: true,
      className: 'whitespace-normal',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link
            // La ficha de la propiedad: typedRoutes no verifica un string armado.
            href={`/propiedades/${row.id}` as Route}
            className="font-medium hover:underline"
          >
            {row.code} · {row.portalTitle}
          </Link>
          <span className="text-xs text-muted-foreground">
            {PROPERTY_TYPE_LABELS[row.propertyType]} · {placeSummary(row)}
          </span>
        </div>
      ),
    },
    {
      id: 'price',
      header: 'Precio',
      showFrom: 'md',
      cell: (row) => operationsSummary(row.operations),
    },
    {
      id: 'status',
      header: 'Estado',
      showFrom: 'lg',
      cell: (row) => (
        <StatusPill tone={PROPERTY_STATUS_DISPLAY[row.status].tone}>
          {PROPERTY_STATUS_DISPLAY[row.status].label}
        </StatusPill>
      ),
    },
    ...(canFeature
      ? [
          {
            id: 'feature',
            header: 'Destacar',
            hideHeader: true,
            className: 'w-32 text-right',
            cell: (row: PanelPropertyRow) => (
              <FeatureButton clientId={clientId} row={row} featured={featured.has(row.id)} />
            ),
          },
        ]
      : []),
  ];

  return (
    <ServerDataTable
      label="Propiedades para ofrecer"
      columns={columns}
      getRowId={(row) => row.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      toolbar={<Toolbar filters={filters} />}
      empty="No hay propiedades en la cartera con estos filtros."
    />
  );
}
