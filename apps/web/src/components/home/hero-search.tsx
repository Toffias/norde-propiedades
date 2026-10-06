import { Search } from 'lucide-react';

import {
  OPERATION_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SEARCH_PARAM_NAMES,
} from '../../lib/properties/search-params';
import { routes } from '../../lib/seo/routes';

const FIELD =
  'w-full bg-transparent text-[15px] font-semibold outline-none placeholder:text-muted-foreground placeholder:font-medium';
const LABEL = 'text-muted-foreground block text-xs font-semibold';
const CELL =
  'focus-within:bg-muted/60 rounded-2xl px-4 py-2.5 transition-colors sm:border-r sm:rounded-none sm:last-of-type:border-r-0';

/**
 * Buscador de la home: un `<form method="get">` que navega al listado con los filtros en la URL.
 * Funciona sin JavaScript.
 */
export function HeroSearch() {
  return (
    <form
      action={routes.properties()}
      method="get"
      role="search"
      aria-label="Buscar propiedades"
      className="bg-card text-card-foreground grid gap-1 rounded-3xl p-2 shadow-xl sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-center"
    >
      <div className={CELL}>
        <label className={LABEL} htmlFor="search-operation">
          Quiero
        </label>
        <select
          id="search-operation"
          name={SEARCH_PARAM_NAMES.operation}
          className={FIELD}
          defaultValue="venta"
        >
          {OPERATION_OPTIONS.map((o) => (
            <option key={o.param} value={o.param}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={CELL}>
        <label className={LABEL} htmlFor="search-type">
          Tipo
        </label>
        <select
          id="search-type"
          name={SEARCH_PARAM_NAMES.propertyType}
          className={FIELD}
          defaultValue=""
        >
          <option value="">Todos los tipos</option>
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.param} value={o.param}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={CELL}>
        <label className={LABEL} htmlFor="search-location">
          ¿Dónde?
        </label>
        <input
          id="search-location"
          name={SEARCH_PARAM_NAMES.location}
          type="search"
          placeholder="Barrio o localidad"
          autoComplete="off"
          maxLength={100}
          className={FIELD}
        />
      </div>

      <button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 flex h-13 items-center justify-center gap-2 rounded-2xl px-7 text-[15px] font-bold transition-colors outline-none focus-visible:ring-[3px]"
      >
        <Search aria-hidden className="size-4" />
        Buscar
      </button>
    </form>
  );
}
