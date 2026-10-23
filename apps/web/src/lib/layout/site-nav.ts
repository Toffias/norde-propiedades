import { listingHref, parseListingFilters } from '../properties/listing-filters';
import { routes } from '../seo/routes';

// El menú principal del sitio: lo usan el header de desktop y el de mobile. El blog va aparte,
// como ícono en la barra de arriba, junto a las redes.

export interface NavLink {
  readonly label: string;
  readonly href: string;
}

const listing = (params: Readonly<Record<string, string>>) =>
  listingHref(parseListingFilters(params));

export const SITE_NAV: readonly NavLink[] = [
  { label: 'Comprar', href: listing({ operacion: 'venta' }) },
  { label: 'Alquilar', href: listing({ operacion: 'alquiler' }) },
  { label: 'Tasaciones', href: routes.appraisals() },
  { label: 'Emprendimientos', href: routes.developments() },
  { label: 'Contacto', href: routes.contact() },
];
