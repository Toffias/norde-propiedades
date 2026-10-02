'use client';

import {
  CLIENT_KIND_LABELS,
  CLIENT_KIND_VALUES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_VALUES,
  type ClientFilter,
  type ClientViewValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { cn } from '@norde/ui/lib/utils';
import {
  BookUserIcon,
  DownloadIcon,
  Loader2Icon,
  SearchIcon,
  SlidersHorizontalIcon,
  TableIcon,
  TagsIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { loadBranchOptions, loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { useListNavigation } from '../../shared/components/server-data-table';
import { loadClientTagOptions } from '../tag-actions';

/** Filtros del listado tal como están en la URL (texto, sin parsear). */
export interface ClientFilterValues {
  readonly q: string;
  readonly agentId: string;
  readonly branchId: string;
  readonly kind: string;
  readonly clientType: string;
  readonly tagged: string;
  readonly tagId: string;
  /** Solo en la agenda: la letra abierta. */
  readonly letter: string;
  readonly owners: boolean;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly updatedFrom: string;
  readonly updatedTo: string;
  readonly view: ClientViewValue;
}

export interface ClientToolbarPermissions {
  readonly seeTrash: boolean;
  readonly export: boolean;
  /** Filtrar por agente: elegir entre los usuarios (`users:read`). */
  readonly pickAgents: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
}

/** "Todos" en un select: sin el param en la URL. */
const ANY = 'any';

export type ClientLayout = 'grid' | 'agenda';

const LAYOUTS: readonly {
  readonly value: ClientLayout;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { value: 'grid', label: 'Grilla', icon: TableIcon },
  { value: 'agenda', label: 'Agenda A–Z', icon: BookUserIcon },
];

/** Grilla o agenda alfabética: la vista va en la URL (?layout=agenda), con los mismos filtros. */
function LayoutSwitcher({ layout }: { readonly layout: ClientLayout }) {
  const { setParams } = useListNavigation();
  return (
    <div
      role="group"
      aria-label="Cómo ver los contactos"
      className="inline-flex shrink-0 self-start rounded-md border border-border bg-card p-0.5"
    >
      {LAYOUTS.map(({ value, label, icon: Icon }) => {
        const active = value === layout;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={label}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              // La agenda ordena por nombre; la letra abierta no tiene sentido en la grilla.
              setParams(
                value === 'agenda'
                  ? { layout: 'agenda', sort: undefined, letter: undefined }
                  : { layout: undefined, letter: undefined },
              );
            }}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Los filtros aplicados, para exportar: viaja el filtro, nunca la lista de contactos. */
export function toClientFilter(filters: ClientFilterValues): ClientFilter {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== false),
  );
}

const ATTACHMENT_NAME = /filename="([^"]+)"/;

/** Pide la exportación y la descarga. Un error esperado vuelve como JSON con su mensaje. */
async function download(filter: ClientFilter) {
  const response = await fetch('/contactos/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : UNEXPECTED_ERROR_MESSAGE;
    throw new Error(message);
  }
  const name =
    ATTACHMENT_NAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    'contactos.xlsx';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Texto libre que actualiza la URL 300 ms después de dejar de escribir. */
function SearchInput({ value }: { readonly value: string }) {
  const { setParams } = useListNavigation();
  const [text, setText] = useState(value);
  // Si la URL cambia desde afuera (volver atrás), el texto la sigue.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => {
      setParams({ q: text.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [text, value, setParams]);

  return (
    <div className="relative w-full sm:max-w-[300px]">
      <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder="Nombre, teléfono, email, empresa o DNI"
        aria-label="Buscar contactos"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </div>
  );
}

function DateRange({
  label,
  from,
  to,
}: {
  readonly label: string;
  readonly from: { readonly param: string; readonly value: string };
  readonly to: { readonly param: string; readonly value: string };
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[
          { ...from, text: 'Desde' },
          { ...to, text: 'Hasta' },
        ].map((edge) => (
          <div key={edge.param} className="flex flex-col gap-1">
            <Label htmlFor={`${id}-${edge.param}`} className="text-xs">
              {edge.text}
            </Label>
            <Input
              id={`${id}-${edge.param}`}
              type="date"
              className="h-8"
              value={edge.value}
              onChange={(event) => {
                setParams({ [edge.param]: event.target.value });
              }}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Agente, sucursal, fechas y papelera: los filtros menos usados, en un popover. */
function MoreFilters({
  filters,
  permissions,
  agentLabel,
  tagLabel,
}: {
  readonly filters: ClientFilterValues;
  readonly permissions: ClientToolbarPermissions;
  readonly agentLabel: string | undefined;
  readonly tagLabel: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  const active = [
    filters.agentId,
    filters.branchId,
    filters.tagId,
    filters.createdFrom,
    filters.createdTo,
    filters.updatedFrom,
    filters.updatedTo,
  ].filter((value) => value !== '').length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          <SlidersHorizontalIcon className="h-4 w-4" />
          Más filtros{active > 0 ? ` (${String(active)})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(92vw,340px)] flex-col gap-4">
        {permissions.pickAgents && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-agent`} className="text-xs">
              Agente
            </Label>
            <EntityPicker
              id={`${id}-agent`}
              value={filters.agentId === '' ? undefined : filters.agentId}
              initial={
                filters.agentId === ''
                  ? undefined
                  : { value: filters.agentId, label: agentLabel ?? 'Agente elegido' }
              }
              onChange={(agentId) => {
                setParams({ agentId });
              }}
              loadPage={loadUserOptions}
              placeholder="Todos los agentes"
              searchPlaceholder="Buscar agente"
              clearLabel="Quitar el agente"
            />
          </div>
        )}
        {permissions.pickBranches && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-branch`} className="text-xs">
              Sucursal
            </Label>
            <EntityPicker
              id={`${id}-branch`}
              value={filters.branchId === '' ? undefined : filters.branchId}
              initial={
                filters.branchId === ''
                  ? undefined
                  : { value: filters.branchId, label: 'Sucursal elegida' }
              }
              onChange={(branchId) => {
                setParams({ branchId });
              }}
              loadPage={loadBranchOptions}
              placeholder="Todas las sucursales"
              searchPlaceholder="Buscar sucursal"
              clearLabel="Quitar la sucursal"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-tag`} className="text-xs">
            Etiqueta
          </Label>
          <EntityPicker
            id={`${id}-tag`}
            value={filters.tagId === '' ? undefined : filters.tagId}
            initial={
              filters.tagId === ''
                ? undefined
                : { value: filters.tagId, label: tagLabel ?? 'Etiqueta elegida' }
            }
            onChange={(tagId) => {
              setParams({ tagId });
            }}
            loadPage={loadClientTagOptions}
            placeholder="Cualquier etiqueta"
            searchPlaceholder="Buscar etiqueta"
            clearLabel="Quitar la etiqueta"
          />
        </div>
        <DateRange
          label="Creación"
          from={{ param: 'createdFrom', value: filters.createdFrom }}
          to={{ param: 'createdTo', value: filters.createdTo }}
        />
        <DateRange
          label="Última actualización"
          from={{ param: 'updatedFrom', value: filters.updatedFrom }}
          to={{ param: 'updatedTo', value: filters.updatedTo }}
        />
        {permissions.seeTrash && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-view`} className="text-xs">
              Mostrar
            </Label>
            <Select
              value={filters.view}
              onValueChange={(view) => {
                setParams({ view: view === 'active' ? undefined : view });
              }}
            >
              <SelectTrigger id={`${id}-view`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Contactos activos</SelectItem>
                <SelectItem value="trash">Papelera</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Vista (grilla o agenda), búsqueda, tipo de registro, tipo de cliente, con o sin etiquetas, solo
 * propietarios, más filtros, etiquetas y exportar.
 */
export function ClientsToolbar({
  filters,
  layout,
  permissions,
  agentLabel,
  tagLabel,
}: {
  readonly filters: ClientFilterValues;
  readonly layout: ClientLayout;
  readonly permissions: ClientToolbarPermissions;
  /** El nombre del agente filtrado, si se conoce (para el selector). */
  readonly agentLabel: string | undefined;
  /** El nombre de la etiqueta filtrada, si se conoce. */
  readonly tagLabel: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  const [exporting, startExport] = useTransition();

  function exportAll() {
    startExport(async () => {
      const toastId = toast.loading('Preparando la planilla…');
      try {
        await download(toClientFilter(filters));
        toast.success('Exportación lista', { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE, {
          id: toastId,
        });
      }
    });
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      {filters.view === 'active' && (
        <div className="col-span-2 sm:contents">
          <LayoutSwitcher layout={layout} />
        </div>
      )}
      <div className="col-span-2 sm:contents">
        <SearchInput value={filters.q} />
      </div>
      <Select
        value={filters.kind === '' ? ANY : filters.kind}
        onValueChange={(next) => {
          setParams({ kind: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[170px]" aria-label="Tipo de registro">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los registros</SelectItem>
          {CLIENT_KIND_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {CLIENT_KIND_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.clientType === '' ? ANY : filters.clientType}
        onValueChange={(next) => {
          setParams({ clientType: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[200px]" aria-label="Tipo de cliente">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los tipos</SelectItem>
          {CLIENT_TYPE_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {CLIENT_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.tagged === '' ? ANY : filters.tagged}
        onValueChange={(next) => {
          setParams({ tagged: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[170px]" aria-label="Etiquetas">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Con y sin etiquetas</SelectItem>
          <SelectItem value="with">Con etiquetas</SelectItem>
          <SelectItem value="without">Sin etiquetas</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 px-1">
        <Switch
          id={`${id}-owners`}
          checked={filters.owners}
          onCheckedChange={(checked) => {
            setParams({ owners: checked ? 'true' : undefined });
          }}
        />
        <Label htmlFor={`${id}-owners`} className="text-sm whitespace-nowrap">
          Solo propietarios
        </Label>
      </div>
      <MoreFilters
        filters={filters}
        permissions={permissions}
        agentLabel={agentLabel}
        tagLabel={tagLabel}
      />
      <Button asChild variant="ghost" className="w-full sm:w-auto">
        <Link href="/contactos/etiquetas">
          <TagsIcon className="h-4 w-4" />
          Etiquetas
        </Link>
      </Button>
      {permissions.export && (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:ml-auto sm:w-auto"
          disabled={exporting}
          onClick={exportAll}
        >
          {exporting ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadIcon className="h-4 w-4" />
          )}
          Exportar a Excel
        </Button>
      )}
    </div>
  );
}
