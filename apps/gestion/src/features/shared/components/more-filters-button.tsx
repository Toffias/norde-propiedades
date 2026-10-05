'use client';

import { Button } from '@norde/ui/components/button';
import { cn } from '@norde/ui/lib/utils';
import { SlidersHorizontalIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

/**
 * El botón de "Más filtros": solo el ícono, con cuántos filtros del popover están aplicados. Va como
 * hijo de `PopoverTrigger asChild` (recibe sus props y su ref).
 */
export function MoreFiltersButton({
  active,
  title = 'Más filtros',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  /** Cuántos filtros del popover están aplicados. */
  readonly active: number;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={active > 0 ? `Más filtros (${String(active)} aplicados)` : 'Más filtros'}
      title={title}
      className={cn('relative', className)}
      {...props}
    >
      <SlidersHorizontalIcon className="h-4 w-4" />
      {active > 0 && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
        >
          {active}
        </span>
      )}
    </Button>
  );
}
