import {
  CONSTRUCTION_STATUS_OPTIONS,
  DEVELOPMENT_TYPE_OPTIONS,
  developmentsHref,
  type DevelopmentFilters,
} from '../../lib/developments/listing-filters';
import { LinkSelect } from '../forms/link-select';

/** Filtros del listado (estado de obra y tipo) como desplegables, al lado del orden. */
export function DevelopmentFilterSelects({ filters }: { readonly filters: DevelopmentFilters }) {
  return (
    // En mobile, los dos en una fila a todo el ancho; desde `sm`, con su ancho fijo.
    <div className="flex w-full gap-2 sm:w-auto">
      <LinkSelect
        label="Estado de obra"
        className="w-auto min-w-0 flex-1 sm:w-44 sm:flex-none"
        selectedHref={developmentsHref(filters)}
        options={[
          {
            label: 'Todos los estados',
            href: developmentsHref(filters, { constructionStatus: undefined }),
          },
          ...CONSTRUCTION_STATUS_OPTIONS.map((option) => ({
            label: option.label,
            href: developmentsHref(filters, { constructionStatus: option.value }),
          })),
        ]}
      />
      <LinkSelect
        label="Tipo de emprendimiento"
        className="w-auto min-w-0 flex-1 sm:w-52 sm:flex-none"
        selectedHref={developmentsHref(filters)}
        options={[
          {
            label: 'Todos los tipos',
            href: developmentsHref(filters, { developmentType: undefined }),
          },
          ...DEVELOPMENT_TYPE_OPTIONS.map((option) => ({
            label: option.label,
            href: developmentsHref(filters, { developmentType: option.value }),
          })),
        ]}
      />
    </div>
  );
}
