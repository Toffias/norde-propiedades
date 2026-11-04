'use client';

import {
  MAX_PUBLIC_LOCATIONS,
  type PublicCountFacet,
  type PublicSearchFacets,
} from '@norde/core/properties/contracts';
import { cn } from '@norde/ui/lib/utils';
import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import {
  activeFilterCount,
  AGE_OPTIONS,
  COUNT_FACETS,
  countOptionLabel,
  CURRENCY_OPTIONS,
  formatArea,
  formatThousands,
  listingHref,
  LISTING_PARAM_NAMES as P,
  MAP_VIEW_PARAM,
  operationHref,
  parseListingFilters,
  priceCurrency,
  SORT_OPTIONS,
  YES_PARAM,
  type ListingFilters,
} from '../../lib/properties/listing-filters';
import { OPERATION_OPTIONS, PROPERTY_TYPE_OPTIONS } from '../../lib/properties/search-params';
import type { LocationOption } from '../../lib/properties/view';
import {
  FilterMultiSelect,
  type MultiSelectChoice,
  type MultiSelectOption,
} from '../forms/filter-multi-select';
import { SiteSelect } from '../forms/site-select';

const LABEL = 'mb-1.5 block text-xs font-bold';
const FIELD =
  'border-input bg-card h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const CHECK =
  'border-input accent-primary size-4 shrink-0 cursor-pointer rounded focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Campos de texto con número: se aplican al salir del campo o con Enter, no a cada tecla. */
const NUMBER_FIELDS: readonly string[] = [P.minPrice, P.maxPrice, P.minArea, P.maxArea];

const COUNT_TITLES: Readonly<Record<PublicCountFacet, string>> = {
  rooms: 'Ambientes',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
};

/**
 * La última búsqueda que mandó el propio formulario. Si la URL cambia por otra cosa (un chip, el
 * orden, "Limpiar"), el formulario se vuelve a armar con los valores nuevos; si la cambió él, no:
 * así no pierde el foco ni el desplegable abierto.
 */
const memory = createNavigationMemory();

function createNavigationMemory() {
  let lastPushed: string | undefined;
  /** El campo que tenía el foco al buscar: si el formulario se rearma, lo recupera. */
  let lastFocusedId: string | undefined;
  return {
    remember(href: string | undefined, focusedId: string | undefined) {
      lastPushed = href;
      lastFocusedId = focusedId;
    },
    lastPushed: () => lastPushed,
    lastFocusedId: () => lastFocusedId,
  };
}

function paramOf<T extends string>(
  options: readonly { value: T; param: string }[],
  value: T | undefined,
): string {
  return options.find((o) => o.value === value)?.param ?? '';
}

/** 1500000 → "1.500.000" mientras se escribe; sin dígitos, vacío. */
function withThousands(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits === '' ? '' : formatThousands(Number(digits));
}

export interface ListingFiltersPanelProps {
  readonly filters: ListingFilters;
  readonly facets: PublicSearchFacets;
  /** Las ubicaciones del catálogo elegidas, con su nombre. */
  readonly locations: readonly MultiSelectChoice[];
}

/**
 * Filtros del listado. Cada cambio busca solo (sin botón); los campos de número, al salir del
 * campo o con Enter. Sin JavaScript es un `<form method="get">` común con su botón.
 * En desktop van siempre a la vista; en mobile, plegados para que los resultados se vean primero.
 */
export function ListingFiltersPanel(props: ListingFiltersPanelProps) {
  const count = activeFilterCount(props.filters);

  return (
    <>
      <details className="details-smooth group bg-card rounded-3xl border lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-bold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden className="size-4" />
            Filtros{count > 0 && ` (${count})`}
          </span>
          <span className="text-muted-foreground text-sm font-medium group-open:hidden">
            Mostrar
          </span>
          <span className="text-muted-foreground hidden text-sm font-medium group-open:inline">
            Ocultar
          </span>
        </summary>
        <div className="px-5 pb-5">
          <SyncedForm {...props} idPrefix="mobile" />
        </div>
      </details>
      <div className="hidden lg:block">
        <SyncedForm {...props} idPrefix="desktop" />
      </div>
    </>
  );
}

/** Rearma el formulario solo si la URL cambió por fuera de él (ver `memory`). */
function SyncedForm(props: ListingFiltersPanelProps & { readonly idPrefix: string }) {
  const href = listingHref(props.filters);
  const [shown, setShown] = useState({ href, version: 0 });
  if (shown.href !== href) {
    // Cada cambio de URL que no hizo el formulario lo rearma, aunque vuelva a una URL anterior.
    const external = href !== memory.lastPushed();
    setShown({ href, version: external ? shown.version + 1 : shown.version });
  }
  return <FiltersForm key={shown.version} {...props} />;
}

function FiltersForm({
  filters,
  facets,
  locations: initialLocations,
  idPrefix,
}: ListingFiltersPanelProps & { readonly idPrefix: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const operationParam = paramOf(OPERATION_OPTIONS, filters.operation);
  const [locations, setLocations] = useState(initialLocations);
  const [types, setTypes] = useState<readonly MultiSelectChoice[]>(() =>
    (filters.propertyTypes ?? []).flatMap((type) => {
      const option = PROPERTY_TYPE_OPTIONS.find((o) => o.value === type);
      return option ? [{ value: option.param, label: option.label }] : [];
    }),
  );
  // Todos los tipos, con cuántas propiedades daría cada uno; los que no tienen ninguna, al final.
  const typeOptions = PROPERTY_TYPE_OPTIONS.map((o) => ({
    value: o.param,
    label: o.label,
    count: facets.propertyTypes.find((t) => t.value === o.value)?.count ?? 0,
  })).sort((a, b) => b.count - a.count);
  const loadLocations = useCallback(
    async (q: string, signal: AbortSignal): Promise<readonly MultiSelectOption[]> => {
      const params = new URLSearchParams();
      if (q !== '') params.set('q', q);
      if (operationParam !== '') params.set('operacion', operationParam);
      const response = await fetch(`/api/ubicaciones?${params.toString()}`, { signal });
      if (!response.ok) return [];
      const body = (await response.json()) as { options?: LocationOption[] };
      return (body.options ?? []).map((o) => ({
        value: o.id,
        label: o.name,
        description: o.description,
        count: o.listingCount,
      }));
    },
    [operationParam],
  );
  const [pending, startTransition] = useTransition();
  const count = activeFilterCount(filters);
  const currency = priceCurrency(filters);
  const id = (name: string) => `${idPrefix}-filter-${name}`;

  // Si el formulario se rearmó, el foco vuelve al campo donde estaba.
  useEffect(() => {
    const focusedId = memory.lastFocusedId();
    if (focusedId === undefined) return;
    const element = document.getElementById(focusedId);
    if (element && form.current?.contains(element)) element.focus({ preventScroll: true });
  }, []);

  function navigate(href: string, remember: boolean) {
    const focused = document.activeElement?.id;
    memory.remember(remember ? href : undefined, focused === '' ? undefined : focused);
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  /**
   * Busca con lo que tiene el formulario. `overrides` pisa campos que todavía no se dibujaron
   * (el valor recién elegido en un desplegable).
   */
  function apply(overrides: Readonly<Record<string, readonly string[]>> = {}) {
    const element = form.current;
    if (!element) return;
    const params: Record<string, string[]> = {};
    for (const [name, value] of new FormData(element)) {
      if (typeof value !== 'string' || name in overrides) continue;
      (params[name] ??= []).push(value);
    }
    for (const [name, values] of Object.entries(overrides)) params[name] = [...values];
    // Leer y volver a escribir la URL la deja en su forma única (orden, sin vacíos ni puntos).
    const href = listingHref(parseListingFilters(params));
    if (href !== listingHref(filters)) navigate(href, true);
  }

  const clearHref = listingHref({
    sort: filters.sort,
    page: 1,
    ...(filters.view && { view: filters.view }),
  });

  return (
    <form
      ref={form}
      action={listingHref({ sort: 'featured', page: 1 })}
      method="get"
      aria-label="Filtrar propiedades"
      aria-busy={pending}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onChange={(event) => {
        const target = event.target;
        // Los números se aplican al salir del campo; el buscador de zonas, al elegir; la
        // operación tiene su propio manejo.
        if (!(target instanceof HTMLInputElement) || target.type === 'search') return;
        if (NUMBER_FIELDS.includes(target.name) || target.name === P.operation) return;
        apply();
      }}
    >
      <fieldset>
        <legend className={LABEL}>Operación</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border p-1">
          {[{ param: '', label: 'Todas' }, ...OPERATION_OPTIONS.slice(0, 2)].map((o) => (
            <label key={o.param} className="relative">
              <input
                type="radio"
                name={P.operation}
                value={o.param}
                defaultChecked={operationParam === o.param}
                onChange={() => {
                  // Cambiar de operación limpia la búsqueda: lo de venta no sirve para alquiler.
                  const operation = OPERATION_OPTIONS.find((op) => op.param === o.param)?.value;
                  navigate(operationHref(filters, operation), false);
                }}
                className="peer sr-only"
              />
              <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:hover:bg-primary-700 peer-focus-visible:ring-ring/50 hover:bg-muted block cursor-pointer rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors peer-focus-visible:ring-[3px]">
                {o.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={LABEL} htmlFor={id('type')}>
          Tipo de propiedad
        </label>
        <FilterMultiSelect
          id={id('type')}
          name={P.propertyType}
          selected={types}
          placeholder="Todos"
          listLabel="Tipos de propiedad"
          options={typeOptions}
          onChange={(next) => {
            setTypes(next);
            apply({ [P.propertyType]: next.map((t) => t.value) });
          }}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={id('location')}>
          Barrio o localidad
        </label>
        <FilterMultiSelect
          id={id('location')}
          name={P.locationId}
          selected={locations}
          placeholder="Todos"
          listLabel="Barrios y localidades"
          loadOptions={loadLocations}
          searchPlaceholder="Buscar barrio o localidad"
          max={MAX_PUBLIC_LOCATIONS}
          onChange={(next) => {
            setLocations(next);
            apply({ [P.locationId]: next.map((l) => l.value) });
          }}
        />
        {/* Sin ubicaciones del catálogo, el texto libre de un link viejo sigue valiendo. */}
        {filters.location && locations.length === 0 && (
          <input type="hidden" name={P.location} value={filters.location} />
        )}
      </div>

      <fieldset>
        <legend className={LABEL}>Precio</legend>
        <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
          <SiteSelect
            name={P.currency}
            aria-label="Moneda"
            defaultValue={paramOf(CURRENCY_OPTIONS, currency)}
            onValueChange={(value) => {
              apply({ [P.currency]: [value] });
            }}
            options={CURRENCY_OPTIONS.map((o) => ({ value: o.param, label: o.label }))}
          />
          <NumberInput
            id={id('min-price')}
            name={P.minPrice}
            label="Precio desde"
            placeholder="Desde"
            value={filters.minPrice}
            onCommit={apply}
          />
          <NumberInput
            id={id('max-price')}
            name={P.maxPrice}
            label="Precio hasta"
            placeholder="Hasta"
            value={filters.maxPrice}
            onCommit={apply}
          />
        </div>
      </fieldset>

      {COUNT_FACETS.map((facet) => (
        <CountSelect
          key={facet}
          facet={facet}
          id={id(facet)}
          name={P[facet]}
          chosen={filters[facet] ?? []}
          counts={facets[facet]}
          onChange={(values) => {
            apply({ [P[facet]]: values });
          }}
        />
      ))}

      <fieldset>
        <legend className={LABEL}>Superficie (m²)</legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            id={id('min-area')}
            name={P.minArea}
            label="Superficie desde, en m²"
            placeholder="Desde"
            value={filters.minArea}
            onCommit={apply}
          />
          <NumberInput
            id={id('max-area')}
            name={P.maxArea}
            label="Superficie hasta, en m²"
            placeholder="Hasta"
            value={filters.maxArea}
            onCommit={apply}
          />
        </div>
      </fieldset>

      <div>
        <label className={LABEL} htmlFor={id('age')}>
          Antigüedad
        </label>
        <SiteSelect
          id={id('age')}
          name={P.age}
          defaultValue={paramOf(AGE_OPTIONS, filters.age)}
          onValueChange={(value) => {
            apply({ [P.age]: [value] });
          }}
          options={[
            { value: '', label: 'Cualquiera' },
            ...AGE_OPTIONS.map((o) => ({ value: o.param, label: o.label })),
          ]}
        />
      </div>

      <FeatureOptions filters={filters} facets={facets} idPrefix={id('feature')} />

      {filters.view === 'map' && <input type="hidden" name={P.view} value={MAP_VIEW_PARAM} />}
      {filters.area && <input type="hidden" name={P.area} value={formatArea(filters.area)} />}
      {filters.sort !== 'featured' && (
        <input type="hidden" name={P.sort} value={paramOf(SORT_OPTIONS, filters.sort)} />
      )}

      <div className="flex items-center gap-3">
        <noscript>
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary-700 h-11 rounded-xl px-6 text-sm font-bold"
          >
            Ver propiedades
          </button>
        </noscript>
        {count > 0 && (
          <Link
            href={clearHref}
            scroll={false}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold"
          >
            Limpiar filtros
          </Link>
        )}
      </div>
    </form>
  );
}

/** Número con puntos de miles mientras se escribe; se aplica al salir del campo o con Enter. */
function NumberInput({
  id,
  name,
  label,
  placeholder,
  value,
  onCommit,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: number | undefined;
  readonly onCommit: () => void;
}) {
  const initial = value === undefined ? '' : formatThousands(value);
  return (
    <input
      id={id}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={initial}
      onInput={(event) => {
        const input = event.currentTarget;
        const formatted = withThousands(input.value);
        // El cursor queda al final: con puntos que aparecen y se corren es lo más predecible.
        if (formatted !== input.value) input.value = formatted;
      }}
      onKeyDown={(event) => {
        // Sin botón de buscar, el navegador no manda el formulario con Enter: lo hace el campo.
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onCommit();
      }}
      onBlur={(event) => {
        if (event.currentTarget.value !== initial) onCommit();
      }}
      className={FIELD}
    />
  );
}

/** Ambientes, dormitorios o baños: desplegable de selección múltiple, con cuántas da cada opción. */
function CountSelect({
  facet,
  id,
  name,
  chosen,
  counts,
  onChange,
}: {
  readonly facet: PublicCountFacet;
  readonly id: string;
  readonly name: string;
  readonly chosen: readonly number[];
  readonly counts: PublicSearchFacets[PublicCountFacet];
  readonly onChange: (values: readonly string[]) => void;
}) {
  const choice = (value: number): MultiSelectChoice => ({
    value: String(value),
    label: countOptionLabel(facet, value),
  });
  const [selected, setSelected] = useState<readonly MultiSelectChoice[]>(() => chosen.map(choice));

  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        {COUNT_TITLES[facet]}
      </label>
      <FilterMultiSelect
        id={id}
        name={name}
        selected={selected}
        placeholder="Cualquiera"
        listLabel={COUNT_TITLES[facet]}
        options={counts.map(({ value, count }) => ({ ...choice(value), count }))}
        onChange={(next) => {
          // De menor a mayor, para que el resumen diga "1 ambiente y 2 ambientes".
          const sorted = [...next].sort((x, y) => Number(x.value) - Number(y.value));
          setSelected(sorted);
          onChange(sorted.map((c) => c.value));
        }}
      />
    </div>
  );
}

/** Amoblado, cochera y las características más frecuentes, con cuántas propiedades tiene cada una. */
function FeatureOptions({
  filters,
  facets,
  idPrefix,
}: {
  readonly filters: ListingFilters;
  readonly facets: PublicSearchFacets;
  readonly idPrefix: string;
}) {
  const chosen = filters.featureIds ?? [];
  const options = [
    {
      id: `${idPrefix}-furnished`,
      name: P.furnished,
      value: YES_PARAM,
      label: 'Amoblado',
      count: facets.furnished,
      checked: filters.furnished === true,
    },
    {
      id: `${idPrefix}-parking`,
      name: P.parking,
      value: YES_PARAM,
      label: 'Con cochera',
      count: facets.withParking,
      checked: filters.parking === true,
    },
    ...facets.features.map((feature) => ({
      id: `${idPrefix}-${feature.id}`,
      name: P.feature,
      value: feature.id,
      label: feature.name,
      count: feature.count,
      checked: chosen.includes(feature.id),
    })),
  ];
  const anyChosen = options.some((o) => o.checked);

  return (
    <details className="details-smooth group" open={anyChosen}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold [&::-webkit-details-marker]:hidden">
        Otras características
        <span className="text-muted-foreground font-medium group-open:hidden">Mostrar</span>
        <span className="text-muted-foreground hidden font-medium group-open:inline">Ocultar</span>
      </summary>
      <div className="mt-3 grid gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            htmlFor={option.id}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 text-sm',
              option.count === 0 && !option.checked && 'opacity-50',
            )}
          >
            <input
              id={option.id}
              type="checkbox"
              name={option.name}
              value={option.value}
              defaultChecked={option.checked}
              className={CHECK}
            />
            <span className="flex-1">{option.label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">({option.count})</span>
          </label>
        ))}
      </div>
    </details>
  );
}
