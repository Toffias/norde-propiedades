import { Button } from '@norde/ui/components/button';
import { Search } from 'lucide-react';

import {
  OPERATION_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SEARCH_PARAM_NAMES,
} from '../../lib/properties/search-params';
import { routes } from '../../lib/seo/routes';

const FIELD =
  'border-input bg-background h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
      className="bg-card text-card-foreground grid gap-3 rounded-xl border p-3 shadow-sm sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:p-4"
    >
      <label className="sr-only" htmlFor="search-operation">
        Operación
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

      <label className="sr-only" htmlFor="search-type">
        Tipo de propiedad
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

      <label className="sr-only" htmlFor="search-location">
        Barrio o localidad
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

      <Button type="submit" size="lg" className="h-11">
        <Search aria-hidden />
        Buscar
      </Button>
    </form>
  );
}
