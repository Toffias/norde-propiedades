import type { NavSubItem } from '@norde/ui/components/nav-list';
import { isActivePath } from '@norde/ui/lib/nav';
import type { Route } from 'next';

import type { CompanyFeatures } from '../../config/env';

// Secciones de "Mi empresa" agrupadas: cada grupo es un subitem del sidebar y sus secciones son las
// pestañas de la pantalla. Cada sección es su propia ruta (se puede compartir y volver atrás). Las
// que Norde no usa (#50) no se muestran mientras su variable de entorno esté apagada; por eso la
// primera sección de cada grupo nunca depende de una.

export interface CompanySection {
  readonly label: string;
  readonly href: Route;
  /** Se muestra solo con esa función prendida. */
  readonly feature?: keyof CompanyFeatures;
}

export interface CompanyGroup {
  readonly label: string;
  readonly description: string;
  readonly sections: readonly [CompanySection, ...CompanySection[]];
}

export const COMPANY_GROUPS: readonly CompanyGroup[] = [
  {
    label: 'General',
    description: 'Datos de la empresa, remitente de los emails y códigos de referencia',
    sections: [
      { label: 'Datos', href: '/mi-empresa/general' },
      { label: 'Email', href: '/mi-empresa/email' },
      { label: 'Marca de agua', href: '/mi-empresa/marca-de-agua', feature: 'watermark' },
      { label: 'Códigos', href: '/mi-empresa/codigos', feature: 'referenceCodes' },
    ],
  },
  {
    label: 'Publicación',
    description: 'Portales donde se publican las propiedades y la ficha en PDF',
    sections: [
      { label: 'Portales', href: '/mi-empresa/portales' },
      { label: 'Ficha y PDF', href: '/mi-empresa/ficha-pdf' },
    ],
  },
  {
    label: 'Catálogos',
    description: 'Valores que se usan al cargar propiedades y oportunidades',
    sections: [
      { label: 'Propiedades', href: '/mi-empresa/propiedades' },
      { label: 'Ubicaciones', href: '/mi-empresa/ubicaciones' },
      { label: 'Servicios y ambientes', href: '/mi-empresa/caracteristicas' },
      { label: 'Etiquetas', href: '/mi-empresa/etiquetas' },
      { label: 'Oportunidades', href: '/mi-empresa/oportunidades' },
    ],
  },
  {
    label: 'Equipo',
    description: 'Quién usa el panel, con qué permisos y en qué sucursal',
    sections: [
      { label: 'Usuarios', href: '/mi-empresa/usuarios' },
      { label: 'Roles', href: '/mi-empresa/roles' },
      { label: 'Sucursales', href: '/mi-empresa/sucursales' },
      { label: 'Equipos', href: '/mi-empresa/equipos', feature: 'teams' },
    ],
  },
  {
    label: 'Archivos',
    description: 'Documentos de la empresa, ordenados en carpetas',
    sections: [{ label: 'Archivos', href: '/mi-empresa/archivos' }],
  },
];

/** Los grupos como submenú de "Mi empresa": cada uno lleva a su primera sección. */
export const COMPANY_NAV_ITEMS: readonly NavSubItem[] = COMPANY_GROUPS.map((group) => ({
  href: group.sections[0].href,
  label: group.label,
  activePaths: group.sections.slice(1).map((section) => section.href),
}));

export function currentCompanyGroup(pathname: string): CompanyGroup | undefined {
  return COMPANY_GROUPS.find((group) =>
    group.sections.some((section) => isActivePath(pathname, section.href)),
  );
}

export function visibleSections(
  group: CompanyGroup,
  features: CompanyFeatures,
): readonly CompanySection[] {
  return group.sections.filter(
    (section) => section.feature === undefined || features[section.feature],
  );
}
