'use client';

import type { SessionProfile } from '@norde/core/identity/contracts';
import { AccountMenu } from '@norde/ui/components/account-menu';
import { AppLogo } from '@norde/ui/components/app-logo';
import { AppShell } from '@norde/ui/components/app-shell';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList } from '@norde/ui/components/breadcrumb';
import { NavList, type NavLinkComponent } from '@norde/ui/components/nav-list';
import { toast } from '@norde/ui/components/sonner';
import { ThemeSwitcher } from '@norde/ui/components/theme-switcher';
import { isActivePath } from '@norde/ui/lib/nav';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { authClient } from '../../../lib/auth-client';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import {
  navigationWithCounts,
  PANEL_NAVIGATION,
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  type NavCounts,
} from '../navigation';

const NavLink: NavLinkComponent = ({ href, className, onClick, children, ...aria }) => (
  // Rutas de `PANEL_NAVIGATION`: typedRoutes no puede verificar los strings del array.
  <Link href={href as Route} className={className} {...(onClick ? { onClick } : {})} {...aria}>
    {children}
  </Link>
);

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function currentSection(pathname: string): string | undefined {
  return PANEL_NAVIGATION.flatMap((group) => group.items).find((item) =>
    isActivePath(pathname, item.href),
  )?.label;
}

export function PanelShell({
  profile,
  initiallyCollapsed,
  counts,
  children,
}: {
  readonly profile: SessionProfile;
  readonly initiallyCollapsed: boolean;
  readonly counts: NavCounts;
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
      brand={<AppLogo onSidebar />}
      collapsedBrand={<AppLogo variant="compact" />}
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
        section !== undefined && (
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="font-semibold text-foreground">{section}</BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )
      }
      actions={
        <>
          <ThemeSwitcher />
          <AccountMenu
            name={profile.name}
            email={profile.email}
            roles={profile.roles.map((role) => role.name)}
            onSignOut={() => void signOut()}
          />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
