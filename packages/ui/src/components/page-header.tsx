import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface PageHeaderProps {
  readonly title: string;
  /** El conteo va acá ("12 usuarios"), no entre paréntesis en el título. */
  readonly subtitle?: ReactNode;
  /** Solo cuando agrega algo. */
  readonly icon?: LucideIcon;
  /** Se alinean al pie, sobre la línea del subtítulo. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Título de pantalla discreto: el peso visual lo llevan los datos, no el encabezado. */
export function PageHeader({ title, subtitle, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
          <h1 className="truncate font-body text-base font-semibold text-foreground dark:text-foreground">
            {title}
          </h1>
        </div>
        {subtitle !== undefined && (
          <p className="mt-1 text-sm leading-normal text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
