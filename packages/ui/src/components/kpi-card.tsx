import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card } from './card';
import { Sparkline } from './chart';
import { Skeleton } from './skeleton';

export type KpiTone = 'default' | 'positive' | 'negative' | 'warning';

const FOOT_TONE: Record<KpiTone, string> = {
  default: 'text-muted-foreground',
  positive: 'text-success-600 dark:text-success-300',
  negative: 'text-danger-700 dark:text-danger-300',
  warning: 'text-warning-700 dark:text-warning-300',
};

export interface KpiCardProps {
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly value: ReactNode;
  readonly foot?: ReactNode;
  readonly tone?: KpiTone;
  /** Serie opcional para el sparkline de área. */
  readonly sparkline?: readonly number[];
  readonly loading?: boolean;
}

export function KpiCard({
  label,
  icon: Icon,
  value,
  foot,
  tone = 'default',
  sparkline,
  loading = false,
}: KpiCardProps) {
  return (
    <Card className="gap-2 px-5 py-4">
      <p className="flex items-center gap-1.5 text-xs leading-normal font-semibold tracking-wide text-muted-foreground uppercase">
        {Icon !== undefined && <Icon className="size-3.5 shrink-0" aria-hidden />}
        {label}
      </p>
      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} />}
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className="font-display text-2xl leading-tight font-semibold tabular-nums">{value}</p>
      )}
      {foot !== undefined && (
        <p className={cn('text-xs leading-normal font-medium', FOOT_TONE[tone])}>{foot}</p>
      )}
    </Card>
  );
}
