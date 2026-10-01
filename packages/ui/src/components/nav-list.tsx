import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { isActivePath } from '../lib/nav';
import { cn } from '../lib/utils';

export interface NavItem<THref extends string = string> {
  readonly href: THref;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Contador (ej. conversaciones sin atender). */
  readonly count?: number;
  /** Nombre accesible del contador ("3 sin atender"). */
  readonly countLabel?: string;
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
  readonly onClick?: (() => void) | undefined;
  readonly children: ReactNode;
}>;

export function NavList<THref extends string>({
  groups,
  pathname,
  linkComponent: Link,
  onNavigate,
}: {
  readonly groups: readonly NavGroup<THref>[];
  readonly pathname: string;
  readonly linkComponent: NavLinkComponent<THref>;
  readonly onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Menú principal"
      className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3"
    >
      {groups.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p className="px-3 pb-1 text-xs leading-normal font-semibold tracking-wide text-sidebar-foreground/50 uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                      active
                        ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span
                        aria-label={item.countLabel ?? String(item.count)}
                        className={cn(
                          'ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none font-bold tabular-nums',
                          active ? 'bg-sidebar-primary-foreground/20' : 'bg-sidebar-accent',
                        )}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
