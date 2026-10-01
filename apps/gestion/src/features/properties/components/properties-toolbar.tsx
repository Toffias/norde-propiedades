'use client';

import {
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
  type PropertyViewValue,
} from '@norde/core/properties/contracts';
import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { MapPinIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';

import { useListNavigation } from '../../shared/components/server-data-table';
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

/** "Todos" en un select: sin el param en la URL. */
const ANY = 'any';

/** Texto que actualiza la URL 300 ms después de dejar de escribir. */
function DebouncedInput({
  param,
  value,
  label,
  placeholder,
  icon: Icon,
  className,
  inputMode,
}: {
  readonly param: string;
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly icon?: ComponentType<{ readonly className?: string }>;
  readonly className: string;
  readonly inputMode?: 'decimal';
}) {
  const { setParams } = useListNavigation();
  const [text, setText] = useState(value);

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => {
      setParams({ [param]: text.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [text, value, param, setParams]);

  return (
    <div className={`relative ${className}`}>
      {Icon && (
        <Icon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        className={Icon ? 'pl-8' : undefined}
        placeholder={placeholder}
        aria-label={label}
        value={text}
        {...(inputMode ? { inputMode } : {})}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </div>
  );
}

function FilterSelect({
  param,
  value,
  label,
  anyLabel,
  options,
  className = 'w-full sm:w-[170px]',
}: {
  readonly param: string;
  readonly value: string;
  readonly label: string;
  /** Sin `anyLabel` el select no tiene opción "todos" (siempre hay un valor elegido). */
  readonly anyLabel?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly className?: string;
}) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={value === '' ? ANY : value}
      onValueChange={(next) => {
        setParams({ [param]: next === ANY ? undefined : next });
      }}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anyLabel !== undefined && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function options<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): { readonly value: string; readonly label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
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
