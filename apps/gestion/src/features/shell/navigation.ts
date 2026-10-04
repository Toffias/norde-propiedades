import type { NavGroup } from '@norde/ui/components/nav-list';
import {
  BuildingIcon,
  CalculatorIcon,
  CalendarCheckIcon,
  HomeIcon,
  InboxIcon,
  LandmarkIcon,
  MegaphoneIcon,
  SettingsIcon,
  TargetIcon,
  UsersIcon,
} from 'lucide-react';

// Módulos del panel (épica #1). Los que todavía no tienen pantalla se ven deshabilitados, así el
// menú ya tiene su forma final. Los contadores de Oportunidades y Consultas los pone el layout
// (`NavCounts`).

const SOON = 'Próximamente';

export const PANEL_NAVIGATION: readonly NavGroup[] = [
  {
    label: 'General',
    items: [{ href: '/', label: 'Inicio', icon: HomeIcon }],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/oportunidades', label: 'Oportunidades', icon: TargetIcon },
      { href: '/contactos', label: 'Contactos', icon: UsersIcon },
      { href: '/consultas', label: 'Consultas', icon: InboxIcon },
    ],
  },
  {
    label: 'Cartera',
    items: [
      { href: '/propiedades', label: 'Propiedades', icon: BuildingIcon },
      { href: '/emprendimientos', label: 'Emprendimientos', icon: LandmarkIcon },
      { href: '/tasaciones', label: 'Tasaciones', icon: CalculatorIcon },
      { href: '/reservas', label: 'Reservas', icon: CalendarCheckIcon },
      { href: '/difusion', label: 'Difusión', icon: MegaphoneIcon, disabledReason: SOON },
    ],
  },
  {
    label: 'Empresa',
    items: [{ href: '/mi-empresa', label: 'Mi empresa', icon: SettingsIcon }],
  },
];

/** Contadores del menú, por ruta (ej. nuevas asignadas en `/oportunidades`). */
export type NavCounts = Readonly<Partial<Record<string, number>>>;

/** Qué cuenta cada contador, para lectores de pantalla y el tooltip. */
const COUNT_LABELS: Readonly<Record<string, (count: number) => string>> = {
  '/oportunidades': (count) =>
    count === 1 ? '1 nueva asignada' : `${String(count)} nuevas asignadas`,
  '/consultas': (count) => (count === 1 ? '1 sin asignar' : `${String(count)} sin asignar`),
};

/** El menú con sus contadores. */
export function navigationWithCounts(counts: NavCounts): readonly NavGroup[] {
  return PANEL_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const count = counts[item.href];
      return count === undefined || count <= 0
        ? item
        : {
            ...item,
            count,
            countLabel: COUNT_LABELS[item.href]?.(count) ?? String(count),
          };
    }),
  }));
}

/** Cookie con el sidebar contraído: la lee el layout para renderizarlo igual desde el servidor. */
export const SIDEBAR_COOKIE = 'norde-sidebar';
export const SIDEBAR_COLLAPSED = 'collapsed';
