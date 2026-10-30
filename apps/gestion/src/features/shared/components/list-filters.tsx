'use client';

import { Checkbox } from '@norde/ui/components/checkbox';
import { Input } from '@norde/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { cn } from '@norde/ui/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import { useEffect, useId, useState, type ComponentType } from 'react';

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

/**
 * Filtro de varios valores (`?status=draft&status=available`): alcanza con que coincida uno. Sin
 * ninguno elegido, no filtra y muestra `anyLabel`. El popover queda abierto mientras se eligen.
 */
export function FilterMultiSelect({
  param,
  value,
  label,
  anyLabel,
  options,
  className = 'w-full sm:w-[170px]',
}: {
  readonly param: string;
  readonly value: readonly string[];
  readonly label: string;
  readonly anyLabel: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly className?: string;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  // Los clicks seguidos se suman acá, sin esperar a que vuelva la página con la URL nueva.
  const [chosen, setChosen] = useState<readonly string[]>(value);
  const [synced, setSynced] = useState(value);
  if (value.join() !== synced.join()) {
    setSynced(value);
    setChosen(value);
  }

  function change(next: readonly string[]) {
    setChosen(next);
    setParams({ [param]: next });
  }

  const labels = options.filter((option) => chosen.includes(option.value));
  const summary =
    labels.length === 0
      ? anyLabel
      : labels.length === 1
        ? (labels[0]?.label ?? anyLabel)
        : `${label} (${labels.length})`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            labels.length === 0 ? label : `${label}: ${labels.map((l) => l.label).join(', ')}`
          }
          className={cn(
            'flex h-9 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-base whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:hover:bg-input/50',
            labels.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <ul aria-label={label} className="custom-scrollbar max-h-72 overflow-y-auto">
          {options.map((option) => {
            const checked = chosen.includes(option.value);
            return (
              <li key={option.value}>
                <label
                  htmlFor={`${id}-${option.value}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={`${id}-${option.value}`}
                    checked={checked}
                    onCheckedChange={() => {
                      change(
                        checked
                          ? chosen.filter((item) => item !== option.value)
                          : [...chosen, option.value],
                      );
                    }}
                  />
                  {option.label}
                </label>
              </li>
            );
          })}
        </ul>
        {chosen.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                change([]);
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
            >
              Quitar el filtro
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function options<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): { readonly value: string; readonly label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
