'use client';

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_VALUES,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_VALUES,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useId } from 'react';

import { DateRange, SearchInput } from '../../clients/components/clients-toolbar';
import { loadClientTagOptions } from '../../clients/tag-actions';
import { loadBranchOptions, loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { useListNavigation } from '../../shared/components/server-data-table';
import { ALL_AGENTS_PARAM } from '../agent-filter';

import { OpportunitySortSelect, type OpportunitySort } from './opportunity-view-controls';

/** Filtros del pipeline tal como están en la URL (texto, sin parsear). */
export interface OpportunityFilterValues {
  readonly q: string;
  readonly agentId: string;
  readonly branchId: string;
  readonly tagId: string;
  readonly originChannel: string;
  readonly category: string;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly updatedFrom: string;
  readonly updatedTo: string;
}

export interface OpportunityFilterPermissions {
  /** Filtrar por agente: elegir entre los usuarios (`users:read`). */
  readonly pickAgents: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
}

/** "Todos" en un select: sin el param en la URL. */
const ANY = 'any';

/** El orden, agente, sucursal, etiqueta y fechas: lo menos usado, en un popover. */
function MoreFilters({
  filters,
  sort,
  permissions,
  agentLabel,
}: {
  readonly filters: OpportunityFilterValues;
  readonly sort: OpportunitySort;
  readonly permissions: OpportunityFilterPermissions;
  readonly agentLabel: string | undefined;
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
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={active > 0 ? `Más filtros (${String(active)} aplicados)` : 'Más filtros'}
          title="Más filtros y orden"
        >
          <SlidersHorizontalIcon className="h-4 w-4" />
          {active > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
            >
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(92vw,340px)] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Ordenar por</span>
          <OpportunitySortSelect sort={sort} className="h-9 sm:w-full" />
        </div>
        {permissions.pickAgents && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-agent`} className="text-xs">
              Agente de la oportunidad
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
                setParams({ agentId: agentId ?? ALL_AGENTS_PARAM });
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
            Etiqueta del contacto
          </Label>
          <EntityPicker
            id={`${id}-tag`}
            value={filters.tagId === '' ? undefined : filters.tagId}
            initial={
              filters.tagId === '' ? undefined : { value: filters.tagId, label: 'Etiqueta elegida' }
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
      </PopoverContent>
    </Popover>
  );
}

/** Búsqueda por contacto, categoría, canal de origen y más filtros (con el orden de todos los estados). */
export function OpportunityFilters({
  filters,
  sort,
  permissions,
  agentLabel,
}: {
  readonly filters: OpportunityFilterValues;
  readonly sort: OpportunitySort;
  readonly permissions: OpportunityFilterPermissions;
  /** El nombre del agente filtrado, si se conoce (para el selector). */
  readonly agentLabel: string | undefined;
}) {
  const { setParams } = useListNavigation();

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      <div className="col-span-3 sm:contents">
        <SearchInput
          value={filters.q}
          placeholder="Contacto: nombre, teléfono, email o DNI"
          label="Buscar oportunidades por contacto"
        />
      </div>
      <Select
        value={filters.category === '' ? ANY : filters.category}
        onValueChange={(next) => {
          setParams({ category: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[210px]" aria-label="Categoría">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todas las categorías</SelectItem>
          {OPPORTUNITY_STATUS_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {OPPORTUNITY_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.originChannel === '' ? ANY : filters.originChannel}
        onValueChange={(next) => {
          setParams({ originChannel: next === ANY ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[190px]" aria-label="Canal de origen">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los canales</SelectItem>
          {CONTACT_CHANNEL_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {CONTACT_CHANNEL_LABELS[value] ?? value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MoreFilters
        filters={filters}
        sort={sort}
        permissions={permissions}
        agentLabel={agentLabel}
      />
    </div>
  );
}
