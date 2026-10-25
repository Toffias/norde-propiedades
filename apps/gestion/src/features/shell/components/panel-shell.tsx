'use client';

import type { SessionProfile } from '@norde/core/identity/contracts';
import type { GlobalSearchKind } from '@norde/core/reporting/contracts';
import type { CompanyBrandView } from '@norde/core/settings/contracts';
import { AccountMenu } from '@norde/ui/components/account-menu';
import { AppIsotype, AppLogo } from '@norde/ui/components/app-logo';
import { AppShell } from '@norde/ui/components/app-shell';
import { DropdownMenuItem } from '@norde/ui/components/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@norde/ui/components/breadcrumb';
import { isActiveSubItem, NavList, type NavLinkComponent } from '@norde/ui/components/nav-list';
import { toast } from '@norde/ui/components/sonner';
import { ThemeSwitcher } from '@norde/ui/components/theme-switcher';
import { isActivePath } from '@norde/ui/lib/nav';
import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRoundIcon } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';

import { authClient } from '../../../lib/auth-client';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import {
  navigationWithCounts,
  PANEL_NAVIGATION,
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  type NavCounts,
} from '../navigation';
import { FallbackImage } from '../../properties/components/property-photo';
import { GlobalSearch } from './global-search';
import { NotificationBell } from './notification-bell';

const NavLink: NavLinkComponent = ({ href, className, onClick, children, ...aria }) => (
  // Rutas de `PANEL_NAVIGATION`: typedRoutes no puede verificar los strings del array.
  <Link href={href as Route} className={className} {...(onClick ? { onClick } : {})} {...aria}>
    {children}
  </Link>
);

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** El item del menú en el que se está y, si tiene submenú, el subitem. */
function currentSection(pathname: string): readonly string[] {
  const item = PANEL_NAVIGATION.flatMap((group) => group.items).find((entry) =>
    isActivePath(pathname, entry.href),
  );
  if (item === undefined) return [];
  const child = item.children?.find((entry) => isActiveSubItem(pathname, entry));
  return child === undefined ? [item.label] : [item.label, child.label];
}

/**
 * Con un logo cargado en Mi empresa > General, reemplaza al isotipo de Norde (que vuelve si el
 * logo no carga).
 */
function brandProps(brand: CompanyBrandView | undefined, size: string) {
  if (brand?.logoVersion === undefined) return {};
  const src = `/mi-empresa/logo/company?v=${encodeURIComponent(brand.logoVersion)}`;
  return {
    name: brand.name,
    mark: (
      <FallbackImage
        key={src}
        src={src}
        className={`${size} shrink-0 rounded-md object-contain`}
        fallback={<AppIsotype className={size} />}
      />
    ),
  };
}

export function PanelShell({
  profile,
  initiallyCollapsed,
  counts,
  searchKinds,
  notifications,
  brand,
  children,
}: {
  readonly profile: SessionProfile;
  readonly initiallyCollapsed: boolean;
  readonly counts: NavCounts;
  readonly searchKinds: readonly GlobalSearchKind[];
  /**
   * La campana: los avisos sin leer de quien entra, sus procesos en segundo plano en curso y si
   * puede ver los de todos.
   */
  readonly notifications: {
    readonly unread: number;
    readonly activeTasks: number;
    readonly canSeeAllTasks: boolean;
  };
  readonly brand: CompanyBrandView | undefined;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const section = currentSection(pathname);

  function changeCollapsed(next: boolean) {
    setCollapsed(next);
    // Preferencia de pantalla, no un dato: va en una cookie para que el servidor la respete.
    const value = next ? SIDEBAR_COLLAPSED : 'expanded';
    document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${String(ONE_YEAR_IN_SECONDS)}; samesite=lax`;
  }

  async function signOut() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error(UNEXPECTED_ERROR_MESSAGE);
      return;
    }
    router.replace('/ingresar');
    router.refresh();
  }

  return (
    <AppShell
      brand={<AppLogo onSidebar {...brandProps(brand, 'h-8 w-8')} />}
      collapsedBrand={<AppLogo variant="compact" {...brandProps(brand, 'h-7 w-7')} />}
      collapsed={collapsed}
      onCollapsedChange={changeCollapsed}
      renderNavigation={(onNavigate, compact) => (
        <NavList
          groups={navigationWithCounts(counts)}
          pathname={pathname}
          linkComponent={NavLink}
          collapsed={compact ?? false}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )}
      breadcrumb={
        section.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
              {section.map((label, index) => (
                <Fragment key={label}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem
                    className={cn(index === section.length - 1 && 'font-semibold text-foreground')}
                  >
                    {label}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )
      }
      actions={
        <>
          <GlobalSearch initialKinds={searchKinds} />
          <NotificationBell
            initialUnread={notifications.unread}
            initialActive={notifications.activeTasks}
            canSeeAllTasks={notifications.canSeeAllTasks}
          />
          <ThemeSwitcher />
          <AccountMenu
            name={profile.name}
            email={profile.email}
            roles={profile.roles.map((role) => role.name)}
            onSignOut={() => void signOut()}
          >
            <DropdownMenuItem asChild>
              <Link href="/mi-cuenta">
                <UserRoundIcon className="h-4 w-4" />
                Mi cuenta
              </Link>
            </DropdownMenuItem>
          </AccountMenu>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
