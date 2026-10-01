import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export type StatusTone = 'green' | 'amber' | 'red' | 'gray';

const PILL: Record<StatusTone, string> = {
  green: 'bg-success-50 text-success-600 dark:bg-success-700/30 dark:text-success-300',
  amber: 'bg-warning-50 text-warning-700 dark:bg-warning-700/30 dark:text-warning-300',
  red: 'bg-danger-50 text-danger-700 dark:bg-danger-700/30 dark:text-danger-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-surface-dark-3 dark:text-gray-400',
};

const DOT: Record<StatusTone, string> = {
  green: 'bg-success-500',
  amber: 'bg-warning-500',
  red: 'bg-danger-500',
  gray: 'bg-gray-400',
};

/**
 * Pill de estado con punto, para entidades de negocio (propiedades, contratos). En tablas
 * administrativas usar `Badge`.
 */
export function StatusPill({
  tone,
  children,
  className,
}: {
  readonly tone: StatusTone;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        PILL[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** Badge chico para periodicidad y contadores. */
export function SoftBadge({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
