'use client';

import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { isActivePath } from '../lib/nav';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface NavItem<THref extends string = string> {
  readonly href: THref;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Contador (ej. conversaciones sin atender). */
  readonly count?: number;
  /** Nombre accesible del contador ("3 sin atender"). */
  readonly countLabel?: string;
  /** El item se ve pero no navega (ej. "Próximamente"): el motivo va en el tooltip. */
  readonly disabledReason?: string;
  /** Submenú: se despliega debajo del item mientras se está en una de sus rutas. */
  readonly children?: readonly NavSubItem<THref>[];
}

export interface NavSubItem<THref extends string = string> {
  readonly href: THref;
  readonly label: string;
  /** Otras rutas en las que el subitem está activo (ej. las pestañas de su pantalla). */
  readonly activePaths?: readonly string[];
}

/** El subitem está activo en su ruta, en las de `activePaths` y en las que cuelgan de ellas. */
export function isActiveSubItem(pathname: string, item: NavSubItem): boolean {
  return [item.href, ...(item.activePaths ?? [])].some((href) => isActivePath(pathname, href));
}

export interface NavGroup<THref extends string = string> {
  readonly label: string;
  readonly items: readonly NavItem<THref>[];
}

/** Link del framework (ej. `next/link`). Así @norde/ui no depende del router. */
export type NavLinkComponent<THref extends string = string> = ComponentType<{
  readonly href: THref;
  readonly className: string;
  readonly 'aria-current'?: 'page' | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly children: ReactNode;
}>;

const SUB_ITEM =
  'block truncate rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none';

const ITEM =
  'flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none';

function Count({
  item,
  active,
  collapsed,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly collapsed: boolean;
}) {
  if (item.count === undefined || item.count <= 0) return null;
  const label = item.countLabel ?? String(item.count);
  if (collapsed) {
    // Sin lugar para el número: un punto, y el número en el tooltip.
    return (
      <span
        aria-label={label}
        className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sidebar-primary ring-2 ring-sidebar"
      />
    );
  }
  return (
    <span
      aria-label={label}
      className={cn(
        'ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none font-bold tabular-nums',
        active ? 'bg-sidebar-primary-foreground/20' : 'bg-sidebar-accent',
      )}
    >
      {item.count}
    </span>
  );
}

export function NavList<THref extends string>({
  groups,
  pathname,
  linkComponent: Link,
  onNavigate,
  collapsed = false,
}: {
  readonly groups: readonly NavGroup<THref>[];
  readonly pathname: string;
  readonly linkComponent: NavLinkComponent<THref>;
  readonly onNavigate?: () => void;
  /** Sidebar contraído: solo íconos, con el nombre en un tooltip. */
  readonly collapsed?: boolean;
}) {
  return (
    <nav
      aria-label="Menú principal"
      className={cn(
        'custom-scrollbar min-h-0 flex-1 overflow-y-auto py-3',
        collapsed ? 'px-2.5' : 'px-2',
      )}
    >
      {groups.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p
            className={cn(
              'px-3 pb-1 text-xs leading-normal font-semibold tracking-wide text-sidebar-foreground/50 uppercase',
              collapsed && 'sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              // Con el submenú abierto, lo resaltado es el subitem: el item queda como título.
              const expanded = active && !collapsed && (item.children?.length ?? 0) > 0;
              const Icon = item.icon;
              const content = (
                <>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>
                    {item.label}
                  </span>
                  <Count item={item} active={active} collapsed={collapsed} />
                </>
              );
              const layout = cn(ITEM, collapsed && 'relative justify-center px-0');

              const entry =
                item.disabledReason === undefined ? (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active && !expanded ? 'page' : undefined}
                    className={cn(
                      layout,
                      expanded
                        ? 'font-semibold text-sidebar-foreground hover:bg-sidebar-accent'
                        : active
                          ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  // Foco por teclado igual que un link, para poder leer el motivo del tooltip.
                  <span
                    role="link"
                    aria-disabled="true"
                    tabIndex={0}
                    className={cn(layout, 'cursor-not-allowed text-sidebar-foreground/40')}
                  >
                    {content}
                  </span>
                );

              const tooltip = collapsed
                ? item.disabledReason === undefined
                  ? item.label
                  : `${item.label} · ${item.disabledReason}`
                : item.disabledReason;

              return (
                <li key={item.href}>
                  {tooltip === undefined ? (
                    entry
                  ) : (
                    <Tooltip>
                      {/* El link del framework no reenvía los eventos del tooltip: se envuelve. */}
                      <TooltipTrigger asChild>
                        <span className="block">{entry}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                  {expanded && item.children && (
                    <ul
                      aria-label={item.label}
                      className="mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
                    >
                      {item.children.map((child) => {
                        const childActive = isActiveSubItem(pathname, child);
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? 'page' : undefined}
                              className={cn(
                                SUB_ITEM,
                                childActive
                                  ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground'
                                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
