'use client';

import {
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
  type PropertyViewValue,
} from '@norde/core/properties/contracts';
import type { ComboboxOption } from '@norde/ui/components/paged-combobox';
import { MapPinIcon, SearchIcon } from 'lucide-react';

import { DebouncedInput, FilterMultiSelect, options } from '../../shared/components/list-filters';
import { TypeaheadFilter } from '../../shared/components/typeahead-filter';
import { loadLocationOptions } from '../actions';
import { OPERATION_LABELS, PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { PropertyFiltersPopover } from './property-filters-popover';

/**
 * Filtros del buscador tal como están en la URL: texto, o listas en los de varios valores (el param
 * se repite). Vacío o sin elementos: sin filtro.
 */
export interface PropertyFilterValues {
  readonly q: string;
  /** IDs de ubicaciones del catálogo. */
  readonly location: readonly string[];
  readonly operation: readonly string[];
  readonly propertyType: readonly string[];
  readonly status: readonly string[];
  readonly scope: string;
  readonly currency: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly view: PropertyViewValue;
}

/** Las ubicaciones elegidas con su nombre, para mostrarlas sin volver a buscarlas. */
export type LocationOptions = readonly ComboboxOption[];

/** Solo los filtros con valor, como los espera el contract (sin textos vacíos ni listas vacías). */
export function activeFilters(filters: PropertyFilterValues): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== '',
    ),
  );
}

/** Hay algún filtro elegido (el alcance y la papelera no cuentan: son la vista). */
export function hasActiveFilters(filters: PropertyFilterValues): boolean {
  return Object.keys(activeFilters(filters)).some((key) => key !== 'view' && key !== 'scope');
}

/**
 * Filtros rápidos del buscador (texto, ubicación, operación, tipo y estado) y el botón de más
 * filtros (moneda y precio, alcance y papelera).
 */
export function PropertiesToolbar({
  filters,
  locationOptions,
  sortsByPrice,
  canSeeTrash,
}: {
  readonly filters: PropertyFilterValues;
  readonly locationOptions: LocationOptions;
  /** Sin moneda no se puede ordenar por precio: al quitarla, el orden vuelve al de siempre. */
  readonly sortsByPrice: boolean;
  readonly canSeeTrash: boolean;
}) {
  return (
    <div data-tour="properties-filters" className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
        <DebouncedInput
          param="q"
          value={filters.q}
          label="Buscar por código, título o dirección"
          placeholder="Código, título o dirección"
          icon={SearchIcon}
          className="col-span-2 w-full sm:max-w-[260px]"
        />
        <TypeaheadFilter
          param="location"
          value={locationOptions}
          label="Barrio, localidad o provincia"
          placeholder="Barrio, localidad o provincia"
          icon={MapPinIcon}
          loadPage={loadLocationOptions}
          className="col-span-2 w-full sm:max-w-[320px]"
        />
        <FilterMultiSelect
          param="operation"
          value={filters.operation}
          label="Operación"
          anyLabel="Operación"
          options={options(OPERATIONS, OPERATION_LABELS)}
        />
        <FilterMultiSelect
          param="propertyType"
          value={filters.propertyType}
          label="Tipo de propiedad"
          anyLabel="Tipo"
          options={options(PROPERTY_TYPES, PROPERTY_TYPE_LABELS)}
        />
        <FilterMultiSelect
          param="status"
          value={filters.status}
          label="Estado"
          anyLabel="Estado"
          options={PROPERTY_STATUS_VALUES.map((value) => ({
            value,
            label: PROPERTY_STATUS_DISPLAY[value].label,
          }))}
        />
        <PropertyFiltersPopover
          filters={filters}
          sortsByPrice={sortsByPrice}
          canSeeTrash={canSeeTrash}
        />
      </div>
    </div>
  );
}
