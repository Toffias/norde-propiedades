import type { NewsKindValue, NewsPeriod } from '@norde/core/audit/contracts';
import type { Route } from 'next';

// El resumen de Noticias: una sección por tipo de noticia. Las de propiedades van en tarjetas con
// la foto; las de contactos, en lista.

export type NewsSectionLayout = 'cards' | 'list';

export interface NewsSection {
  readonly kind: NewsKindValue;
  readonly title: string;
  readonly layout: NewsSectionLayout;
  /** Para la frase del resumen: "1 reserva", "3 reservas". */
  readonly one: string;
  readonly many: string;
}

/**
 * En el orden en que se muestran: primero lo que se ofrece a los clientes. Todos los tipos tienen
 * sección (lo verifica un test).
 */
export const NEWS_SECTIONS: readonly NewsSection[] = [
  {
    kind: 'property.created',
    title: 'Propiedades nuevas',
    layout: 'cards',
    one: 'propiedad nueva',
    many: 'propiedades nuevas',
  },
  {
    kind: 'property.price_changed',
    title: 'Cambios de precio',
    layout: 'cards',
    one: 'cambio de precio',
    many: 'cambios de precio',
  },
  {
    kind: 'property.reservation',
    title: 'Reservas',
    layout: 'cards',
    one: 'reserva',
    many: 'reservas',
  },
  {
    kind: 'property.status_changed',
    title: 'Cambios de estado',
    layout: 'cards',
    one: 'cambio de estado',
    many: 'cambios de estado',
  },
  {
    kind: 'property.operation_changed',
    title: 'Cambios de operación',
    layout: 'cards',
    one: 'cambio de operación',
    many: 'cambios de operación',
  },
  {
    kind: 'client.created',
    title: 'Contactos nuevos',
    layout: 'list',
    one: 'contacto nuevo',
    many: 'contactos nuevos',
  },
  {
    kind: 'client.reassigned',
    title: 'Contactos reasignados',
    layout: 'list',
    one: 'contacto reasignado',
    many: 'contactos reasignados',
  },
  {
    kind: 'client.deleted',
    title: 'Contactos borrados',
    layout: 'list',
    one: 'contacto borrado',
    many: 'contactos borrados',
  },
];

/** El ancla de cada sección, para los enlaces de la frase del resumen. */
export function newsSectionAnchor(kind: NewsKindValue): string {
  return `seccion-${kind.replace('.', '-')}`;
}

/** Tarjetas por tanda: dos filas de tres en las de propiedades. */
export const NEWS_SECTION_PAGE_SIZES: Readonly<Record<NewsSectionLayout, number>> = {
  cards: 6,
  list: 5,
};

/** Las secciones de los tipos elegidos, en el orden del resumen. */
export function newsSectionsFor(kinds: readonly NewsKindValue[]): readonly NewsSection[] {
  return NEWS_SECTIONS.filter((section) => kinds.includes(section.kind));
}

// El período va en la URL (`?periodo=ayer`), en castellano como el resto de las rutas del panel.

const PERIOD_PARAMS: Readonly<Record<NewsPeriod, string>> = {
  today: 'hoy',
  yesterday: 'ayer',
  week: 'semana',
};

export const NEWS_PERIOD_LABELS: Readonly<Record<NewsPeriod, string>> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
};

export const NEWS_PERIOD_ORDER: readonly NewsPeriod[] = ['today', 'yesterday', 'week'];

/** Sin parámetro (o con uno que no existe), hoy. */
export function parseNewsPeriod(value: string | string[] | undefined): NewsPeriod {
  return NEWS_PERIOD_ORDER.find((period) => PERIOD_PARAMS[period] === value) ?? 'today';
}

export function newsPeriodHref(period: NewsPeriod): Route {
  return period === 'today' ? '/noticias' : (`/noticias?periodo=${PERIOD_PARAMS[period]}` as Route); // La ruta es fija; el período va en la query.
}
