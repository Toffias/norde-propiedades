'use client';

import { AccountMenu } from '@norde/ui/components/account-menu';
import { AppLogo } from '@norde/ui/components/app-logo';
import { AppShell } from '@norde/ui/components/app-shell';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@norde/ui/components/breadcrumb';
import { DropdownMenuItem } from '@norde/ui/components/dropdown-menu';
import { NavList, type NavGroup, type NavLinkComponent } from '@norde/ui/components/nav-list';
import { toast } from '@norde/ui/components/sonner';
import { ThemeSwitcher } from '@norde/ui/components/theme-switcher';
import { isActivePath } from '@norde/ui/lib/nav';
import {
  BuildingIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ListIcon,
  LogInIcon,
  PaletteIcon,
  TableIcon,
  UserCogIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAVIGATION: readonly NavGroup<Route>[] = [
  {
    label: 'Design system',
    items: [
      { href: '/dev/design-system/componentes', label: 'Componentes', icon: PaletteIcon },
      {
        href: '/dev/design-system/listado',
        label: 'Listado',
        icon: ListIcon,
        count: 3,
        countLabel: '3 contactos nuevos',
      },
      {
        href: '/dev/design-system/grilla-paginada',
        label: 'Grilla paginada',
        icon: TableIcon,
      },
      { href: '/dev/design-system/grilla', label: 'Grilla', icon: LayoutGridIcon },
      { href: '/dev/design-system/ficha', label: 'Ficha', icon: BuildingIcon },
      { href: '/dev/design-system/tablero', label: 'Tablero', icon: LayoutDashboardIcon },
    ],
  },
  {
    label: 'Pantallas públicas',
    items: [{ href: '/dev/ingresar', label: 'Ingresar', icon: LogInIcon }],
  },
];

const NavLink: NavLinkComponent<Route> = ({ href, className, onClick, children, ...aria }) => (
  <Link href={href} className={className} {...(onClick ? { onClick } : {})} {...aria}>
    {children}
  </Link>
);

function currentSection(pathname: string): string | undefined {
  return NAVIGATION.flatMap((group) => group.items).find((item) =>
    isActivePath(pathname, item.href),
  )?.label;
}

export function DesignSystemShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const section = currentSection(pathname);

  return (
    <AppShell
      brand={<AppLogo onSidebar />}
      renderNavigation={(onNavigate) => (
        <NavList
          groups={NAVIGATION}
          pathname={pathname}
          linkComponent={NavLink}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="font-semibold text-foreground">Design system</BreadcrumbItem>
            {section !== undefined && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage>{section}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <ThemeSwitcher />
          <AccountMenu
            name="Laura Gómez"
            email="laura.gomez@example.com"
            roles={['Administración', 'Ventas']}
            onSignOut={() => {
              toast('Demo: el cierre de sesión llega con el módulo de usuarios.');
            }}
          >
            <DropdownMenuItem>
              <UserCogIcon className="h-4 w-4" />
              Mi perfil
            </DropdownMenuItem>
          </AccountMenu>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
