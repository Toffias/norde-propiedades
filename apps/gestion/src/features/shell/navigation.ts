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
// menú ya tiene su forma final. Los contadores de Oportunidades y Consultas llegan con #9 y #10.

const SOON = 'Próximamente';

export const PANEL_NAVIGATION: readonly NavGroup[] = [
  {
    label: 'General',
    items: [{ href: '/', label: 'Inicio', icon: HomeIcon }],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/oportunidades', label: 'Oportunidades', icon: TargetIcon, disabledReason: SOON },
      { href: '/contactos', label: 'Contactos', icon: UsersIcon, disabledReason: SOON },
      { href: '/consultas', label: 'Consultas', icon: InboxIcon, disabledReason: SOON },
    ],
  },
  {
    label: 'Cartera',
    items: [
      { href: '/propiedades', label: 'Propiedades', icon: BuildingIcon, disabledReason: SOON },
      {
        href: '/emprendimientos',
        label: 'Emprendimientos',
        icon: LandmarkIcon,
        disabledReason: SOON,
      },
      { href: '/tasaciones', label: 'Tasaciones', icon: CalculatorIcon, disabledReason: SOON },
      { href: '/reservas', label: 'Reservas', icon: CalendarCheckIcon, disabledReason: SOON },
      { href: '/difusion', label: 'Difusión', icon: MegaphoneIcon, disabledReason: SOON },
    ],
  },
  {
    label: 'Empresa',
    items: [{ href: '/mi-empresa', label: 'Mi empresa', icon: SettingsIcon, disabledReason: SOON }],
  },
];

/** Cookie con el sidebar contraído: la lee el layout para renderizarlo igual desde el servidor. */
export const SIDEBAR_COOKIE = 'norde-sidebar';
export const SIDEBAR_COLLAPSED = 'collapsed';
