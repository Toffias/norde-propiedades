import { PROPERTY_TYPE_PLURALS } from '../properties/labels';
import { listingHref, parseListingFilters } from '../properties/listing-filters';
import { PROPERTY_TYPE_OPTIONS } from '../properties/search-params';
import { routes } from '../seo/routes';

// El menú principal del sitio: lo usan el header de desktop (con desplegables) y el de mobile.

export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavLink[];
}

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const listing = (params: Readonly<Record<string, string>>) =>
  listingHref(parseListingFilters(params));

export const SITE_NAV: readonly NavEntry[] = [
  {
    label: 'Propiedades',
    items: [
      { label: 'Todas las propiedades', href: routes.properties() },
      ...PROPERTY_TYPE_OPTIONS.map((type) => ({
        label: PROPERTY_TYPE_PLURALS[type.value],
        href: listing({ tipo: type.param }),
      })),
    ],
  },
  {
    label: 'Operación',
    items: [
      { label: 'Comprar', href: listing({ operacion: 'venta' }) },
      { label: 'Alquilar', href: listing({ operacion: 'alquiler' }) },
      { label: 'Emprendimientos', href: routes.developments() },
      { label: 'Tasaciones', href: routes.appraisals() },
    ],
  },
  { label: 'Blog', href: routes.blog() },
  { label: 'Contacto', href: routes.contact() },
];
