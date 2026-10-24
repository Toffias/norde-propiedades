'use client';

import { cn } from '@norde/ui/lib/utils';
import { MapPin } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { SEARCH_PARAM_NAMES } from '../../lib/properties/search-params';
import type { LocationOption } from '../../lib/properties/view';

/** Espera entre teclas antes de buscar. */
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

interface LocationComboboxProps {
  readonly id: string;
  /** La ubicación del catálogo ya elegida (viene en la URL). */
  readonly selected?: { readonly id: string; readonly name: string } | undefined;
  /** Texto libre que no coincidió con ninguna ubicación. */
  readonly defaultText?: string | undefined;
  readonly placeholder: string;
  readonly variant?: 'field' | 'bare';
  readonly className?: string;
}

/**
 * Buscador de barrios y localidades: sugiere las ubicaciones del catálogo con propiedades
 * publicadas, así todos buscan "Ramos Mejía" igual, lo escriban como lo escriban. Al elegir una,
 * el formulario manda su ID (`ubicacion`); si no se elige ninguna, manda el texto (`zona`) y el
 * listado lo resuelve. Sin JavaScript es un campo de texto común.
 */
export function LocationCombobox({
  id,
  selected,
  defaultText,
  placeholder,
  variant = 'field',
  className,
}: LocationComboboxProps) {
  const listId = useId();
  const [text, setText] = useState(selected?.name ?? defaultText ?? '');
  const [chosen, setChosen] = useState(selected);
  // Las sugerencias quedan atadas al texto que las pidió: si cambió, no se muestran.
  const [results, setResults] = useState<{
    readonly q: string;
    readonly options: readonly LocationOption[];
  }>({ q: '', options: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const request = useRef<AbortController | undefined>(undefined);

  const q = text.trim();
  const searching = q.length >= MIN_LENGTH && q !== chosen?.name;
  const options = searching && results.q === q ? results.options : [];

  // Busca al escribir, salvo que el texto sea el de la ubicación ya elegida.
  useEffect(() => {
    if (!searching) return undefined;
    const timer = setTimeout(() => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      fetch(`/api/ubicaciones?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { options: [] }))
        .then((body: { options?: LocationOption[] }) => {
          setResults({ q, options: body.options ?? [] });
          setActive(-1);
        })
        .catch((error: unknown) => {
          // Un pedido viejo cancelado no es un error; sin sugerencias, el texto libre sigue andando.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setResults({ q, options: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [q, searching]);

  const expanded = open && options.length > 0;

  function choose(option: LocationOption) {
    setChosen({ id: option.id, name: option.name });
    setText(option.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={100}
        placeholder={placeholder}
        // Con una ubicación elegida, viaja su ID y el texto sobra.
        name={chosen ? undefined : SEARCH_PARAM_NAMES.location}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setChosen(undefined);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (options.length === 0) return;
            event.preventDefault();
            setOpen(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => (current + step + options.length) % options.length);
          } else if (event.key === 'Enter' && expanded && active >= 0) {
            const option = options[active];
            if (!option) return;
            event.preventDefault();
            choose(option);
          } else if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={className}
      />
      {chosen && <input type="hidden" name={SEARCH_PARAM_NAMES.locationId} value={chosen.id} />}
      <ul
        id={listId}
        role="listbox"
        aria-label="Barrios y localidades"
        hidden={!expanded}
        className={cn(
          'bg-card text-card-foreground absolute z-50 mt-1.5 max-h-80 min-w-full overflow-y-auto rounded-2xl border p-1 shadow-xl',
          variant === 'bare' ? '-left-4 w-[calc(100%+2rem)]' : 'left-0 w-full',
        )}
      >
        {options.map((option, index) => (
          <li
            key={option.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // `mousedown` antes del `blur` del campo: si no, la lista se cierra antes del click.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
            onMouseEnter={() => {
              setActive(index);
            }}
            className="aria-selected:bg-muted flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <MapPin aria-hidden className="text-primary size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{option.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {option.description}
              </span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
              {option.listingCount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
