'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { cn } from '@norde/ui/lib/utils';
import { useState } from 'react';

// Radix Select no admite `value=""`: la opción "Todos" viaja como este centinela y el campo
// oculto la vuelve a mandar vacía, igual que el `<select>` nativo al que reemplaza.
const EMPTY = '__all';

export interface SiteSelectOption {
  readonly value: string;
  readonly label: string;
}

interface SiteSelectProps {
  readonly options: readonly SiteSelectOption[];
  readonly id?: string;
  /** Si se pasa, el valor elegido viaja en el formulario con este nombre. */
  readonly name?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly 'aria-label'?: string;
  /** `field`: con borde, como los demás campos; `bare`: sin caja (buscador de la home). */
  readonly variant?: 'field' | 'bare';
  readonly className?: string;
}

/**
 * Desplegable con la identidad del sitio: reemplaza al `<select>` nativo, que cada sistema
 * dibuja a su manera. Dentro de un `<form method="get">` manda su valor como un campo más.
 */
export function SiteSelect({
  options,
  id,
  name,
  defaultValue = '',
  onValueChange,
  variant = 'field',
  className,
  ...aria
}: SiteSelectProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <>
      <Select
        value={value === '' ? EMPTY : value}
        onValueChange={(next) => {
          const plain = next === EMPTY ? '' : next;
          setValue(plain);
          onValueChange?.(plain);
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={aria['aria-label']}
          className={cn(
            'w-full cursor-pointer font-semibold whitespace-nowrap [&>svg]:transition-transform [&[data-state=open]>svg]:rotate-180',
            variant === 'field' &&
              'bg-card hover:border-foreground/30 dark:bg-card dark:hover:bg-card h-11! rounded-xl px-3 text-sm',
            variant === 'bare' &&
              'h-auto! border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent',
            className,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          sideOffset={6}
          className="bg-card text-card-foreground max-h-80 rounded-2xl border p-1 shadow-xl"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value === '' ? EMPTY : option.value}
              className="data-[state=checked]:text-primary focus:bg-muted focus:text-foreground cursor-pointer rounded-xl py-2.5 pr-9 pl-3 text-sm font-semibold [&_svg]:text-current"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name !== undefined && <input type="hidden" name={name} value={value} />}
    </>
  );
}
