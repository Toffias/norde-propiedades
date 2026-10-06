import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

import {
  activeFilterCount,
  CURRENCY_OPTIONS,
  LISTING_PARAM_NAMES as P,
  priceCurrency,
  ROOM_OPTIONS,
  SORT_OPTIONS,
  type ListingFilters,
} from '../../lib/properties/listing-filters';
import { OPERATION_OPTIONS, PROPERTY_TYPE_OPTIONS } from '../../lib/properties/search-params';
import { routes } from '../../lib/seo/routes';

const LABEL = 'mb-1.5 block text-xs font-bold';
const FIELD =
  'border-input bg-card h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function paramOf<T extends string>(
  options: readonly { value: T; param: string }[],
  value: T | undefined,
): string {
  return options.find((o) => o.value === value)?.param ?? '';
}

/**
 * Filtros del listado: un `<form method="get">` que reescribe la URL y funciona sin JavaScript.
 * En desktop van siempre a la vista; en mobile, plegados para que los resultados se vean primero.
 */
export function ListingFiltersPanel({ filters }: { readonly filters: ListingFilters }) {
  const count = activeFilterCount(filters);

  return (
    <>
      <details className="group bg-card rounded-3xl border lg:hidden">
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
          <FiltersForm filters={filters} idPrefix="mobile" />
        </div>
      </details>
      <div className="hidden lg:block">
        <FiltersForm filters={filters} idPrefix="desktop" />
      </div>
    </>
  );
}

/** `idPrefix`: el formulario se dibuja dos veces (mobile y desktop) y los IDs no se repiten. */
function FiltersForm({
  filters,
  idPrefix,
}: {
  readonly filters: ListingFilters;
  readonly idPrefix: string;
}) {
  const count = activeFilterCount(filters);
  const currency = priceCurrency(filters);
  const id = (name: string) => `${idPrefix}-filter-${name}`;

  return (
    <form
      action={routes.properties()}
      method="get"
      aria-label="Filtrar propiedades"
      className="space-y-5"
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
                defaultChecked={paramOf(OPERATION_OPTIONS, filters.operation) === o.param}
                className="peer sr-only"
              />
              <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-ring/50 hover:bg-muted block cursor-pointer rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors peer-focus-visible:ring-[3px]">
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
        <select
          id={id('type')}
          name={P.propertyType}
          defaultValue={paramOf(PROPERTY_TYPE_OPTIONS, filters.propertyType)}
          className={FIELD}
        >
          <option value="">Todos</option>
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.param} value={o.param}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL} htmlFor={id('location')}>
          Barrio o localidad
        </label>
        <input
          id={id('location')}
          name={P.location}
          type="search"
          defaultValue={filters.location ?? ''}
          placeholder="Mataderos, Ramos Mejía…"
          maxLength={100}
          className={FIELD}
        />
      </div>

      <fieldset>
        <legend className={LABEL}>Precio</legend>
        <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
          <select
            name={P.currency}
            aria-label="Moneda"
            defaultValue={paramOf(CURRENCY_OPTIONS, currency)}
            className={FIELD}
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.param} value={o.param}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            name={P.minPrice}
            inputMode="numeric"
            aria-label="Precio desde"
            placeholder="Desde"
            defaultValue={filters.minPrice ?? ''}
            className={FIELD}
          />
          <input
            name={P.maxPrice}
            inputMode="numeric"
            aria-label="Precio hasta"
            placeholder="Hasta"
            defaultValue={filters.maxPrice ?? ''}
            className={FIELD}
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL} htmlFor={id('rooms')}>
            Ambientes
          </label>
          <select
            id={id('rooms')}
            name={P.minRooms}
            defaultValue={filters.minRooms ?? ''}
            className={FIELD}
          >
            <option value="">Todos</option>
            {ROOM_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 5 ? '5 o más' : `${n} o más`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor={id('bedrooms')}>
            Dormitorios
          </label>
          <select
            id={id('bedrooms')}
            name={P.minBedrooms}
            defaultValue={filters.minBedrooms ?? ''}
            className={FIELD}
          >
            <option value="">Todos</option>
            {ROOM_OPTIONS.slice(0, 4).map((n) => (
              <option key={n} value={n}>
                {`${n} o más`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filters.sort !== 'featured' && (
        <input type="hidden" name={P.sort} value={paramOf(SORT_OPTIONS, filters.sort)} />
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 h-11 flex-1 rounded-xl text-sm font-bold transition-colors outline-none focus-visible:ring-[3px]"
        >
          Ver propiedades
        </button>
        {count > 0 && (
          <Link
            href={routes.properties()}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold"
          >
            Limpiar
          </Link>
        )}
      </div>
    </form>
  );
}
