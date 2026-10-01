'use client';

import { MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from './button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

export interface AppShellProps {
  /** Logo de la cabecera del sidebar (`AppLogo onSidebar`). */
  readonly brand: ReactNode;
  /** Debajo del logo (ej. un selector). Opcional. */
  readonly sidebarExtra?: ReactNode;
  /** El menú (`NavList`). Recibe `onNavigate` para cerrar el panel mobile al navegar. */
  readonly renderNavigation: (onNavigate?: () => void) => ReactNode;
  /** Izquierda de la topbar: "Sección" o "Sección / entidad". */
  readonly breadcrumb?: ReactNode;
  /** Derecha de la topbar: ThemeSwitcher + AccountMenu. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

function SidebarHeader({
  brand,
  extra,
}: {
  readonly brand: ReactNode;
  readonly extra?: ReactNode;
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">{brand}</div>
      <div className="mx-4 border-t border-sidebar-border" />
      {extra !== undefined && <div className="px-4 pt-3">{extra}</div>}
    </>
  );
}

/**
 * Layout privado: sidebar oscuro de 240 px (en los dos temas), topbar sticky de 56 px y contenido.
 * Debajo de `md` el sidebar se oculta y la topbar muestra un botón que abre el mismo menú en un
 * panel lateral.
 */
export function AppShell({
  brand,
  sidebarExtra,
  renderNavigation,
  breadcrumb,
  actions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <SidebarHeader brand={brand} extra={sidebarExtra} />
        {renderNavigation()}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[260px] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button:last-child]:text-sidebar-foreground [&>button:last-child]:hover:bg-white/10"
        >
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Secciones del panel</SheetDescription>
          <SidebarHeader brand={brand} extra={sidebarExtra} />
          {renderNavigation(() => {
            setMobileOpen(false);
          })}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-(--z-sticky) flex h-14 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Abrir menú"
              onClick={() => {
                setMobileOpen(true);
              }}
            >
              <MenuIcon className="h-4 w-4" />
            </Button>
            {breadcrumb}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
        <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
