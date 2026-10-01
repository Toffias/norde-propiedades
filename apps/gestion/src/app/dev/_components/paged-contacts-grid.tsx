'use client';

import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { DownloadIcon, PencilIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  ServerDataTable,
  useListNavigation,
} from '../../../features/shared/components/server-data-table';
import { EMPTY_VALUE, formatDate } from '../../../lib/format';
import { CHANNEL_LABELS, CONTACT_STATUS, type DemoContact } from './demo-data';

const COLUMNS: readonly DataTableColumn<DemoContact>[] = [
  {
    id: 'name',
    header: 'Nombre',
    sortable: true,
    className: 'font-medium',
    cell: (contact) => contact.name,
  },
  {
    id: 'phone',
    header: 'Teléfono',
    className: 'text-muted-foreground tabular-nums',
    cell: (contact) => contact.phone,
  },
  {
    id: 'email',
    header: 'Email',
    showFrom: 'xl',
    className: 'text-muted-foreground',
    cell: (contact) => contact.email ?? EMPTY_VALUE,
  },
  {
    id: 'channel',
    header: 'Canal',
    showFrom: 'md',
    className: 'w-[130px] text-muted-foreground',
    cell: (contact) => CHANNEL_LABELS[contact.channel],
  },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    className: 'w-[140px]',
    cell: (contact) => (
      <Badge variant={CONTACT_STATUS[contact.status].variant}>
        {CONTACT_STATUS[contact.status].label}
      </Badge>
    ),
  },
  {
    id: 'createdAt',
    header: 'Alta',
    sortable: true,
    showFrom: 'md',
    className: 'w-[120px] text-muted-foreground',
    cell: (contact) => formatDate(contact.createdAt),
  },
  {
    id: 'actions',
    header: 'Acciones',
    hideHeader: true,
    className: 'w-[60px] text-right',
    cell: (contact) => (
      <RowActions>
        <RowAction
          icon={PencilIcon}
          label="Editar"
          onClick={() => {
            toast.info('Demo', { description: `Editarías a ${contact.name}.` });
          }}
        />
      </RowActions>
    ),
  },
];

const STATUS_FILTERS = ['all', 'new', 'following', 'closed'] as const;

/** Filtros dentro de la card: navegan con la grilla (mismo `pending`). */
function DemoContactsToolbar({ text, status }: { readonly text: string; readonly status: string }) {
  const { setParams } = useListNavigation();
  const [search, setSearch] = useState(text);

  // Debounce de 300 ms: no se navega con cada tecla.
  useEffect(() => {
    if (search.trim() === text) return;
    const timer = setTimeout(() => {
      setParams({ text: search.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search, text, setParams]);

  return (
    <>
      <div className="relative w-full sm:max-w-[280px]">
        <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar por nombre o teléfono"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <Select
        value={status}
        onValueChange={(next) => {
          setParams({ status: next === 'all' ? undefined : next });
        }}
      >
        <SelectTrigger className="w-[180px]" aria-label="Estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {value === 'all' ? 'Todos los estados' : CONTACT_STATUS[value].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export interface PagedContactsGridProps {
  readonly rows: readonly DemoContact[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly text: string;
  readonly status: string;
}

function getRowId(contact: DemoContact): string {
  return contact.id;
}

export function PagedContactsGrid({ text, status, ...page }: PagedContactsGridProps) {
  const hasFilters = text !== '' || status !== 'all';

  return (
    <ServerDataTable
      label="Contactos"
      columns={COLUMNS}
      getRowId={getRowId}
      {...page}
      selectable
      toolbar={<DemoContactsToolbar text={text} status={status} />}
      empty={
        hasFilters
          ? 'No hay contactos que coincidan con los filtros.'
          : 'Todavía no hay contactos. Los que lleguen por WhatsApp o los portales aparecen acá.'
      }
      bulkActions={(selection, count) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            toast.success('Exportación encolada (demo)', {
              description:
                selection.kind === 'filter'
                  ? `Viaja el filtro: ${String(count)} contactos.`
                  : `Viajan ${String(count)} IDs.`,
            });
          }}
        >
          <DownloadIcon className="h-4 w-4" />
          Exportar
        </Button>
      )}
    />
  );
}
