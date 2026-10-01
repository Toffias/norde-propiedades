'use client';

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  /** Texto secundario (ej. código o barrio). */
  readonly hint?: string;
}

export interface ComboboxPage {
  readonly options: readonly ComboboxOption[];
  readonly hasMore: boolean;
}

/**
 * Trae una página del catálogo (de a 20) filtrada por `search`. En gestión, una Server Action que
 * llama a una query del core. `page` empieza en 1.
 */
export type LoadComboboxPage = (search: string, page: number) => Promise<ComboboxPage>;

/** Resultado de la búsqueda `search`. Si no coincide con la búsqueda actual, la lista está cargando. */
type Loaded =
  | { readonly search: string; readonly status: 'error' }
  | {
      readonly search: string;
      readonly status: 'ready';
      readonly options: readonly ComboboxOption[];
      readonly page: number;
      readonly hasMore: boolean;
      readonly loadingMore: boolean;
    };

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Lista paginada con búsqueda (con debounce) y "Cargar más". Vive dentro del PopoverContent: se
 * monta al abrir, así que cada apertura arranca de cero.
 */
function PagedOptionList({
  loadPage,
  isSelected,
  onSelect,
  searchPlaceholder,
  emptyText,
}: {
  readonly loadPage: LoadComboboxPage;
  readonly isSelected: (option: ComboboxOption) => boolean;
  readonly onSelect: (option: ComboboxOption) => void;
  readonly searchPlaceholder: string;
  readonly emptyText: string;
}) {
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const state = loaded?.search === search ? loaded : ({ status: 'loading' } as const);

  useEffect(() => {
    // Una respuesta vieja (de una búsqueda ya reemplazada) no pisa la actual.
    let stale = false;
    const timer = setTimeout(() => {
      loadPage(search, 1).then(
        (result) => {
          if (stale) return;
          setLoaded({
            search,
            status: 'ready',
            options: result.options,
            page: 1,
            hasMore: result.hasMore,
            loadingMore: false,
          });
        },
        () => {
          if (!stale) setLoaded({ search, status: 'error' });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [search, loadPage]);

  function loadMore() {
    if (state.status !== 'ready') return;
    const nextPage = state.page + 1;
    setLoaded({ ...state, loadingMore: true });
    loadPage(search, nextPage).then(
      (result) => {
        setLoaded((current) =>
          current?.search === search && current.status === 'ready'
            ? {
                ...current,
                options: [...current.options, ...result.options],
                page: nextPage,
                hasMore: result.hasMore,
                loadingMore: false,
              }
            : current,
        );
      },
      () => {
        setLoaded((current) =>
          current?.search === search ? { search, status: 'error' } : current,
        );
      },
    );
  }

  return (
    <>
      <div className="relative border-b p-2">
        <SearchIcon className="absolute top-1/2 left-4.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-8 w-full rounded-md bg-transparent pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div role="listbox" className="custom-scrollbar max-h-64 overflow-y-auto p-1">
        {state.status === 'loading' && (
          <div className="flex justify-center py-6">
            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Cargando…</span>
          </div>
        )}
        {state.status === 'error' && (
          <p className="px-2 py-6 text-center text-sm leading-normal text-destructive">
            No pudimos cargar las opciones.
          </p>
        )}
        {state.status === 'ready' && state.options.length === 0 && (
          <p className="px-2 py-6 text-center text-sm leading-normal text-muted-foreground">
            {emptyText}
          </p>
        )}
        {state.status === 'ready' &&
          state.options.map((option) => {
            const selected = isSelected(option);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(option);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <CheckIcon
                  className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>
                )}
              </button>
            );
          })}
        {state.status === 'ready' && state.hasMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            disabled={state.loadingMore}
            onClick={loadMore}
          >
            {state.loadingMore && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Cargar más
          </Button>
        )}
      </div>
    </>
  );
}

interface ComboboxBaseProps {
  readonly loadPage: LoadComboboxPage;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly 'aria-invalid'?: boolean;
}

/** Selector con búsqueda sobre un catálogo paginado en el servidor. */
export function PagedCombobox({
  value,
  onChange,
  loadPage,
  placeholder = 'Elegí una opción',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados.',
  disabled = false,
  ...triggerProps
}: ComboboxBaseProps & {
  /** Opción elegida (con su label, para mostrarla sin volver a buscarla). */
  readonly value: ComboboxOption | null;
  readonly onChange: (option: ComboboxOption | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          {...triggerProps}
        >
          <span className={cn('truncate', value === null && 'text-muted-foreground')}>
            {value?.label ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <PagedOptionList
          loadPage={loadPage}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          isSelected={(option) => option.value === value?.value}
          onSelect={(option) => {
            onChange(option.value === value?.value ? null : option);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Variante de selección múltiple: el popover queda abierto mientras se eligen opciones. */
export function PagedMultiSelect({
  value,
  onChange,
  loadPage,
  placeholder = 'Elegí una o más opciones',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados.',
  disabled = false,
  ...triggerProps
}: ComboboxBaseProps & {
  readonly value: readonly ComboboxOption[];
  readonly onChange: (options: readonly ComboboxOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (value[0]?.label ?? placeholder)
        : `${value.length} seleccionadas`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          {...triggerProps}
        >
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
            {summary}
          </span>
          <ChevronsUpDownIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <PagedOptionList
          loadPage={loadPage}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          isSelected={(option) => value.some((selected) => selected.value === option.value)}
          onSelect={(option) => {
            const exists = value.some((selected) => selected.value === option.value);
            onChange(
              exists
                ? value.filter((selected) => selected.value !== option.value)
                : [...value, option],
            );
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
