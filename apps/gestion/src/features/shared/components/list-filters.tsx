'use client';

import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { useEffect, useState, type ComponentType } from 'react';

import { useListNavigation } from './server-data-table';

// Filtros del toolbar de una grilla: cambian los query params de la URL (ver `ServerDataTable`).

/** "Todos" en un select: sin el param en la URL. */
const ANY = 'any';

/** Texto que actualiza la URL 300 ms después de dejar de escribir. */
export function DebouncedInput({
  param,
  value,
  label,
  placeholder,
  icon: Icon,
  className,
  inputMode,
}: {
  readonly param: string;
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly icon?: ComponentType<{ readonly className?: string }>;
  readonly className: string;
  readonly inputMode?: 'decimal';
}) {
  const { setParams } = useListNavigation();
  const [text, setText] = useState(value);
  // Si la URL cambia desde afuera (una búsqueda favorita, volver atrás), el texto la sigue: si no,
  // el debounce volvería a escribir el valor viejo.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => {
      setParams({ [param]: text.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [text, value, param, setParams]);

  return (
    <div className={`relative ${className}`}>
      {Icon && (
        <Icon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        className={Icon ? 'pl-8' : undefined}
        placeholder={placeholder}
        aria-label={label}
        value={text}
        {...(inputMode ? { inputMode } : {})}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </div>
  );
}

export function FilterSelect({
  param,
  value,
  label,
  anyLabel,
  options,
  className = 'w-full sm:w-[170px]',
}: {
  readonly param: string;
  readonly value: string;
  readonly label: string;
  /** Sin `anyLabel` el select no tiene opción "todos" (siempre hay un valor elegido). */
  readonly anyLabel?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly className?: string;
}) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={value === '' ? ANY : value}
      onValueChange={(next) => {
        setParams({ [param]: next === ANY ? undefined : next });
      }}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anyLabel !== undefined && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function options<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): { readonly value: string; readonly label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
