'use client';

import { cn } from '@norde/ui/lib/utils';
import { Check, ChevronDown, MapPin, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { MAX_PUBLIC_LOCATIONS } from '@norde/core/properties/contracts';

import { SEARCH_PARAM_NAMES } from '../../lib/properties/search-params';
import type { LocationOption } from '../../lib/properties/view';

/** Espera entre teclas antes de buscar. */
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

export interface ChosenLocation {
  readonly id: string;
  readonly name: string;
}

interface LocationMultiSelectProps {
  readonly id: string;
  /** Las elegidas (vienen en la URL). */
  readonly selected: readonly ChosenLocation[];
  /** Parámetro de la operación (`venta`, `alquiler`): los conteos son de esa operación. */
  readonly operation: string | undefined;
  readonly placeholder: string;
  readonly onChange: (next: readonly ChosenLocation[]) => void;
}

/**
 * Desplegable de barrios y localidades con buscador: al abrirlo muestra los que más propiedades
 * tienen y, al escribir, los que coinciden; cada uno con su cantidad ("Mataderos (10)"). Se
 * pueden elegir varios; cada elegido viaja en el formulario como `ubicacion`.
 */
export function LocationMultiSelect({
  id,
  selected,
  operation,
  placeholder,
  onChange,
}: LocationMultiSelectProps) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Las opciones quedan atadas al pedido que las trajo: si cambió, no se muestran.
  const [results, setResults] = useState<{
    readonly key: string;
    readonly options: readonly LocationOption[];
  }>({ key: '', options: [] });
  const request = useRef<AbortController | undefined>(undefined);

  const q = text.trim();
  const searchable = q.length === 0 || q.length >= MIN_LENGTH;
  const key = `${q}|${operation ?? ''}`;
  const options = results.key === key ? results.options : [];
  const loading = open && searchable && results.key !== key;
  const full = selected.length >= MAX_PUBLIC_LOCATIONS;

  useEffect(() => {
    if (!open || !searchable) return undefined;
    const timer = setTimeout(
      () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const params = new URLSearchParams();
        if (q !== '') params.set('q', q);
        if (operation) params.set('operacion', operation);
        fetch(`/api/ubicaciones?${params.toString()}`, { signal: controller.signal })
          .then((response) => (response.ok ? response.json() : { options: [] }))
          .then((body: { options?: LocationOption[] }) => {
            setResults({ key, options: body.options ?? [] });
            setActive(-1);
          })
          .catch((error: unknown) => {
            // Un pedido viejo cancelado no es un error; sin opciones, el resto del buscador anda.
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setResults({ key, options: [] });
          });
      },
      q === '' ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [open, searchable, q, operation, key]);

  // Se cierra al hacer click afuera.
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

  const isChosen = (locationId: string) => selected.some((s) => s.id === locationId);

  function toggle(option: LocationOption) {
    if (isChosen(option.id)) {
      onChange(selected.filter((s) => s.id !== option.id));
    } else if (!full) {
      onChange([...selected, { id: option.id, name: option.name }]);
      setText('');
    }
    input.current?.focus();
  }

  const expanded = open && (options.length > 0 || loading || (searchable && q !== ''));

  return (
    <div ref={root} className="relative">
      <div
        className="border-input bg-card focus-within:border-ring focus-within:ring-ring/50 flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5 focus-within:ring-[3px]"
        onClick={() => {
          input.current?.focus();
          setOpen(true);
        }}
      >
        {selected.map((location) => (
          <span
            key={location.id}
            className="bg-muted flex h-7 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-semibold"
          >
            {location.name}
            <button
              type="button"
              aria-label={`Quitar ${location.name}`}
              className="hover:bg-background focus-visible:ring-ring/50 flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              onClick={(event) => {
                event.stopPropagation();
                onChange(selected.filter((s) => s.id !== location.id));
              }}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          maxLength={80}
          placeholder={selected.length > 0 ? 'Agregar otro…' : placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (options.length === 0) return;
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive((current) => (current + step + options.length) % options.length);
            } else if (event.key === 'Enter') {
              // Enter no manda el formulario: elige la opción marcada (o la primera).
              event.preventDefault();
              const option = options[active >= 0 ? active : 0];
              if (expanded && option) toggle(option);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === 'Backspace' && text === '' && selected.length > 0) {
              onChange(selected.slice(0, -1));
            } else if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
          className="placeholder:text-muted-foreground h-8 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
        />
        <ChevronDown
          aria-hidden
          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', {
            'rotate-180': expanded,
          })}
        />
      </div>
      {selected.map((location) => (
        <input
          key={location.id}
          type="hidden"
          name={SEARCH_PARAM_NAMES.locationId}
          value={location.id}
        />
      ))}
      <ul
        id={listId}
        role="listbox"
        aria-label="Barrios y localidades"
        aria-multiselectable
        hidden={!expanded}
        className="bg-card text-card-foreground absolute top-full left-0 z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-2xl border p-1 shadow-xl"
      >
        {options.map((option, index) => {
          const chosen = isChosen(option.id);
          return (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={chosen}
              aria-disabled={!chosen && full}
              // `mousedown` antes del `blur` del campo: si no, el foco se va antes del click.
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
                !chosen && full && 'cursor-not-allowed opacity-50',
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
                  {option.name}{' '}
                  <span className="text-muted-foreground font-medium tabular-nums">
                    ({option.listingCount})
                  </span>
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {option.description}
                </span>
              </span>
              <MapPin aria-hidden className="text-primary size-4 shrink-0" />
            </li>
          );
        })}
        {loading && options.length === 0 && (
          <li role="presentation" className="text-muted-foreground px-3 py-2.5 text-sm">
            Buscando…
          </li>
        )}
        {!loading && options.length === 0 && q !== '' && (
          <li role="presentation" className="text-muted-foreground px-3 py-2.5 text-sm">
            No hay propiedades en esa zona.
          </li>
        )}
      </ul>
    </div>
  );
}
