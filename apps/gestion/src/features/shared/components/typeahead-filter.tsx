'use client';

import type { ComboboxOption, LoadComboboxPage } from '@norde/ui/components/paged-combobox';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon, XIcon } from 'lucide-react';
import { useEffect, useId, useState, type ComponentType } from 'react';

import { useListNavigation } from './server-data-table';

/** Espera entre teclas antes de buscar, y largo mínimo de lo escrito. */
const DEBOUNCE_MS = 250;
const MIN_LENGTH = 2;

/** Sugerencias de lo escrito: si el texto cambió, no se muestran. */
type Suggestions =
  | { readonly q: string; readonly status: 'error' }
  | { readonly q: string; readonly status: 'ready'; readonly options: readonly ComboboxOption[] };

/**
 * Filtro con sugerencias al escribir, como el buscador de ubicaciones del sitio: se eligen una o
 * más opciones del catálogo, que quedan como etiquetas y viajan por ID en la URL (el param
 * repetido). Alcanza con que coincida una.
 */
export function TypeaheadFilter({
  param,
  value,
  label,
  placeholder,
  icon: Icon,
  loadPage,
  className,
}: {
  readonly param: string;
  /** Las opciones elegidas, con su nombre (la página las resuelve por ID). */
  readonly value: readonly ComboboxOption[];
  readonly label: string;
  readonly placeholder: string;
  readonly icon?: ComponentType<{ readonly className?: string }>;
  readonly loadPage: LoadComboboxPage;
  readonly className: string;
}) {
  const listId = useId();
  const { setParams } = useListNavigation();
  // Lo elegido se suma acá, sin esperar a que vuelva la página con la URL nueva.
  const [chosen, setChosen] = useState<readonly ComboboxOption[]>(value);
  const [synced, setSynced] = useState(value);
  const key = (options: readonly ComboboxOption[]) => options.map((o) => o.value).join();
  if (key(value) !== key(synced)) {
    setSynced(value);
    setChosen(value);
  }
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestions | undefined>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = text.trim();
  const searching = q.length >= MIN_LENGTH;
  const current = searching && suggestions?.q === q ? suggestions : undefined;
  const options =
    current?.status === 'ready'
      ? current.options.filter((option) => !chosen.some((c) => c.value === option.value))
      : [];
  const expanded = open && searching;

  useEffect(() => {
    if (!searching) return undefined;
    // Una respuesta vieja (de un texto ya reemplazado) no pisa la actual.
    let stale = false;
    const timer = setTimeout(() => {
      loadPage(q, 1).then(
        (page) => {
          if (stale) return;
          setSuggestions({ q, status: 'ready', options: page.options });
          setActive(-1);
        },
        () => {
          if (!stale) setSuggestions({ q, status: 'error' });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, searching, loadPage]);

  function change(next: readonly ComboboxOption[]) {
    setChosen(next);
    setParams({ [param]: next.map((option) => option.value) });
  }

  function choose(option: ComboboxOption) {
    change([...chosen, option]);
    setText('');
    setActive(-1);
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-card px-2 py-1 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
        {Icon && <Icon className="mx-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        {chosen.map((option) => (
          <span
            key={option.value}
            className="flex max-w-full items-center gap-0.5 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs font-medium"
          >
            <span className="truncate">{option.label}</span>
            <button
              type="button"
              aria-label={`Quitar ${option.label}`}
              onClick={() => {
                change(chosen.filter((c) => c.value !== option.value));
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          maxLength={80}
          placeholder={chosen.length === 0 ? placeholder : 'Sumar otra…'}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
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
              setActive((index) => (index + step + options.length) % options.length);
            } else if (event.key === 'Enter' && expanded) {
              // Enter sin moverse elige la primera sugerencia.
              const option = options[active >= 0 ? active : 0];
              if (!option) return;
              event.preventDefault();
              choose(option);
            } else if (event.key === 'Escape' && expanded) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === 'Backspace' && text === '' && chosen.length > 0) {
              change(chosen.slice(0, -1));
            }
          }}
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      <div
        hidden={!expanded}
        className="absolute top-full left-0 z-50 mt-1 w-full min-w-[16rem] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {current === undefined && (
          <div className="flex justify-center py-4">
            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscando…</span>
          </div>
        )}
        {current?.status === 'error' && (
          <p className="px-2 py-4 text-center text-sm text-destructive">
            No pudimos cargar las sugerencias.
          </p>
        )}
        {current?.status === 'ready' && options.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sin resultados.</p>
        )}
        <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
          {options.map((option, index) => (
            <li
              key={option.value}
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
              className="cursor-pointer rounded-md px-2 py-1.5 aria-selected:bg-accent"
            >
              <span className="block truncate text-sm font-medium">{option.label}</span>
              {option.hint !== undefined && (
                <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
