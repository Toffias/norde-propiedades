'use client';

import { cn } from '@norde/ui/lib/utils';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/** Espera entre teclas antes de buscar. */
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

export interface MultiSelectChoice {
  readonly value: string;
  readonly label: string;
}

export interface MultiSelectOption extends MultiSelectChoice {
  /** Segunda línea: dónde queda un barrio, por ejemplo. */
  readonly description?: string;
  /** Cuántas propiedades daría; sin valor, no se muestra. */
  readonly count?: number;
}

interface FilterMultiSelectProps {
  readonly id: string;
  /** Cada elegida viaja en el formulario con este nombre. */
  readonly name: string;
  readonly selected: readonly MultiSelectChoice[];
  /** Lo que muestra el campo sin nada elegido ("Todos"). */
  readonly placeholder: string;
  readonly listLabel: string;
  /** Opciones fijas (tipos de propiedad)… */
  readonly options?: readonly MultiSelectOption[];
  /** …o buscadas al escribir; sin texto, las que conviene ofrecer primero. Muestra un buscador. */
  readonly loadOptions?: (q: string, signal: AbortSignal) => Promise<readonly MultiSelectOption[]>;
  readonly searchPlaceholder?: string;
  /** Tope de elegidas a la vez. */
  readonly max?: number;
  readonly onChange: (next: readonly MultiSelectChoice[]) => void;
}

/** "Liniers", "Liniers y Mataderos", "Liniers y 2 más": el campo nunca crece con lo elegido. */
function summary(selected: readonly MultiSelectChoice[]): string | undefined {
  const [first, second] = selected;
  if (!first) return undefined;
  if (selected.length === 1) return first.label;
  if (selected.length === 2 && second) return `${first.label} y ${second.label}`;
  return `${first.label} y ${selected.length - 1} más`;
}

/**
 * Desplegable de selección múltiple de los filtros: el campo muestra un resumen de una línea y
 * cada elegida se ve (y se saca) en los chips de arriba del listado. Las opciones llevan su
 * cantidad: "Mataderos (10)".
 */
export function FilterMultiSelect({
  id,
  name,
  selected,
  placeholder,
  listLabel,
  options: fixedOptions,
  loadOptions,
  searchPlaceholder = 'Buscar…',
  max,
  onChange,
}: FilterMultiSelectProps) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(-1);
  // Las opciones buscadas quedan atadas al texto que las pidió: si cambió, no se muestran.
  const [results, setResults] = useState<{
    readonly q: string | undefined;
    readonly options: readonly MultiSelectOption[];
  }>({ q: undefined, options: [] });

  const searchable = loadOptions !== undefined;
  const q = text.trim();
  const canSearch = q.length === 0 || q.length >= MIN_LENGTH;
  const loaded = results.q === q ? results.options : [];
  const loading = searchable && open && canSearch && results.q !== q;
  const full = max !== undefined && selected.length >= max;
  const isChosen = (value: string) => selected.some((s) => s.value === value);

  // Sin texto, las elegidas van primero aunque no estén entre las que se ofrecen.
  const options: readonly MultiSelectOption[] = searchable
    ? q === ''
      ? [...selected.filter((s) => !loaded.some((o) => o.value === s.value)), ...loaded]
      : loaded
    : (fixedOptions ?? []);

  useEffect(() => {
    if (!open || !loadOptions || !canSearch) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        loadOptions(q, controller.signal)
          .then((found) => {
            setResults({ q, options: found });
            setActive(-1);
          })
          .catch((error: unknown) => {
            // Un pedido viejo cancelado no es un error; sin opciones, el resto del buscador anda.
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setResults({ q, options: [] });
          });
      },
      q === '' ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, loadOptions, canSearch, q]);

  // Se cierra al tocar afuera.
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  // Al abrir, el foco va al buscador (o a la lista, si no hay buscador).
  useEffect(() => {
    if (!open) return;
    (searchable ? search.current : list.current)?.focus();
  }, [open, searchable]);

  function close() {
    setOpen(false);
    setText('');
    trigger.current?.focus();
  }

  function toggle(option: MultiSelectOption) {
    if (isChosen(option.value)) {
      onChange(selected.filter((s) => s.value !== option.value));
    } else if (!full) {
      onChange([...selected, { value: option.value, label: option.label }]);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
    } else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      // Enter no manda el formulario: marca o desmarca la opción activa.
      event.preventDefault();
      const option = options[active];
      if (option) toggle(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const label = summary(selected);
  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="border-input bg-card hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold outline-none focus-visible:ring-[3px]"
      >
        <span className={cn('min-w-0 flex-1 truncate', !label && 'text-muted-foreground')}>
          {label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', {
            'rotate-180': open,
          })}
        />
      </button>
      {selected.map((choice) => (
        <input key={choice.value} type="hidden" name={name} value={choice.value} />
      ))}
      <div
        hidden={!open}
        className="bg-card text-card-foreground absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-2xl border shadow-xl"
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b px-3">
            <Search aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={search}
              type="search"
              role="combobox"
              aria-label={searchPlaceholder}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={activeId}
              autoComplete="off"
              maxLength={80}
              placeholder={searchPlaceholder}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
              }}
              onKeyDown={onKeyDown}
              className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        )}
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          aria-multiselectable
          aria-activedescendant={searchable ? undefined : activeId}
          tabIndex={searchable ? -1 : 0}
          onKeyDown={searchable ? undefined : onKeyDown}
          className="max-h-72 overflow-y-auto p-1 outline-none"
        >
          {options.map((option, index) => {
            const chosen = isChosen(option.value);
            const disabled = !chosen && full;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={chosen}
                aria-disabled={disabled}
                // `mousedown` antes del `blur`: si no, el foco se va antes del click.
                onMouseDown={(event) => {
                  event.preventDefault();
                  toggle(option);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                  index === active && 'bg-muted',
                  disabled && 'cursor-not-allowed opacity-50',
                  !chosen && option.count === 0 && 'opacity-50',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    chosen ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {chosen && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {option.label}
                    {option.count !== undefined && (
                      <span className="text-muted-foreground ml-1 font-medium tabular-nums">
                        ({option.count})
                      </span>
                    )}
                  </span>
                  {option.description && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {option.description}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
          {loading && options.length === 0 && (
            <li role="presentation" className="text-muted-foreground px-3 py-2.5 text-sm">
              Buscando…
            </li>
          )}
          {!loading && options.length === 0 && (
            <li role="presentation" className="text-muted-foreground px-3 py-2.5 text-sm">
              {searchable && q.length > 0 && q.length < MIN_LENGTH
                ? 'Escribí al menos 2 letras.'
                : 'No hay propiedades con esa opción.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
