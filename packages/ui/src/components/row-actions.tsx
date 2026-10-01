'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** Acciones de una fila, alineadas a la derecha. */
export function RowActions({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn('flex items-center justify-end gap-0.5', className)}>{children}</div>;
}

export interface RowActionProps {
  readonly icon: LucideIcon;
  /** Nombre accesible y texto del tooltip: la tabla no gasta ancho en texto. */
  readonly label: string;
  readonly onClick?: () => void;
  readonly destructive?: boolean;
  /** Motivo por el que la acción no está disponible; se muestra en el tooltip. */
  readonly disabledReason?: string;
}

export function RowAction({
  icon: Icon,
  label,
  onClick,
  destructive = false,
  disabledReason,
}: RowActionProps) {
  const disabled = disabledReason !== undefined;
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        destructive &&
          'text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20',
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        {/* Un botón deshabilitado no emite eventos de puntero: el span recibe el hover. */}
        {disabled ? <span tabIndex={0}>{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent>{disabledReason ?? label}</TooltipContent>
    </Tooltip>
  );
}
