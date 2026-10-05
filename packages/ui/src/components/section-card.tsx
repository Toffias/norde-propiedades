import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card } from './card';

/**
 * Bloque de una ficha de detalle: cabecera con título (y un ícono opcional) y acción opcional,
 * cuerpo con padding.
 */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={cn('gap-0 p-0', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-bold">
          {Icon !== undefined && <Icon className="size-4 shrink-0 text-foreground" aria-hidden />}
          {title}
        </h2>
        {action !== undefined && <div className="-my-1.5 shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </Card>
  );
}
