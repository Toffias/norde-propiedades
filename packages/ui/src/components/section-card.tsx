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
  leading,
  action,
  children,
  className,
  bodyClassName,
}: {
  readonly title: string;
  readonly icon?: LucideIcon;
  /** En lugar del ícono, antes del título: por ejemplo, el logo de una marca. */
  readonly leading?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** Para el cuerpo; por ejemplo, `flex flex-1 flex-col` para que ocupe el alto de la tarjeta. */
  readonly bodyClassName?: string;
}) {
  return (
    <Card className={cn('gap-0 p-0', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-bold">
          {leading ??
            (Icon !== undefined && (
              <Icon className="size-4 shrink-0 text-foreground" aria-hidden />
            ))}
          {title}
        </h2>
        {action !== undefined && <div className="-my-1.5 shrink-0">{action}</div>}
      </div>
      <div className={cn('px-5 py-5', bodyClassName)}>{children}</div>
    </Card>
  );
}
