import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card } from './card';
import { Skeleton } from './skeleton';

export function ChartCard({
  title,
  icon: Icon,
  subtitle,
  loading = false,
  height = 220,
  children,
  className,
}: {
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly subtitle?: string;
  readonly loading?: boolean;
  /** Alto del skeleton mientras carga; igual al del gráfico. */
  readonly height?: number;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={cn('min-w-0 gap-3 px-5 py-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-body text-sm font-semibold">
          {Icon !== undefined && <Icon className="size-4 shrink-0 text-foreground" aria-hidden />}
          {title}
        </h2>
        {subtitle !== undefined && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {loading ? <Skeleton className="w-full" style={{ height }} /> : children}
    </Card>
  );
}
