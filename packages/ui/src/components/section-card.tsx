import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card } from './card';

/** Bloque de una ficha de detalle: cabecera con título y acción opcional, cuerpo con padding. */
export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={cn('gap-0 p-0', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base font-bold">{title}</h2>
        {action !== undefined && <div className="-my-1.5 shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </Card>
  );
}
