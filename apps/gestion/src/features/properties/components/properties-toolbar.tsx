'use client';

import {
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
  type PropertyViewValue,
} from '@norde/core/properties/contracts';
import { MapPinIcon, SearchIcon } from 'lucide-react';

import { DebouncedInput, FilterSelect, options } from '../../shared/components/list-filters';
import { OPERATION_LABELS, PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { PropertyFiltersPopover } from './property-filters-popover';

/** Filtros del buscador tal como están en la URL (texto, sin parsear). */
export interface PropertyFilterValues {
  readonly q: string;
  readonly location: string;
  readonly operation: string;
  readonly propertyType: string;
  readonly status: string;
  readonly scope: string;
  readonly currency: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly view: PropertyViewValue;
}

/**
 * Filtros rápidos del buscador (texto, ubicación, operación, tipo y estado) y el botón de más
 * filtros (moneda y precio, alcance y papelera).
 */
export function PropertiesToolbar({
  filters,
  sortsByPrice,
  canSeeTrash,
}: {
  readonly filters: PropertyFilterValues;
  /** Sin moneda no se puede ordenar por precio: al quitarla, el orden vuelve al de siempre. */
  readonly sortsByPrice: boolean;
  readonly canSeeTrash: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
        <DebouncedInput
          param="q"
          value={filters.q}
          label="Buscar por código, título o dirección"
          placeholder="Código, título o dirección"
          icon={SearchIcon}
          className="col-span-2 w-full sm:max-w-[260px]"
        />
        <DebouncedInput
          param="location"
          value={filters.location}
          label="Barrio, localidad o provincia"
          placeholder="Barrio, localidad o provincia"
          icon={MapPinIcon}
          className="col-span-2 w-full sm:max-w-[240px]"
        />
        <FilterSelect
          param="operation"
          value={filters.operation}
          label="Operación"
          anyLabel="Operación"
          options={options(OPERATIONS, OPERATION_LABELS)}
        />
        <FilterSelect
          param="propertyType"
          value={filters.propertyType}
          label="Tipo de propiedad"
          anyLabel="Tipo"
          options={options(PROPERTY_TYPES, PROPERTY_TYPE_LABELS)}
        />
        <FilterSelect
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
