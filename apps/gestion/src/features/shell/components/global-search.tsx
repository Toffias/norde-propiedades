'use client';

import {
  GLOBAL_SEARCH_KINDS,
  GLOBAL_SEARCH_MIN_LENGTH,
  type GlobalSearchGroup,
  type GlobalSearchHit,
  type GlobalSearchKind,
  type GlobalSearchResult,
} from '@norde/core/reporting/contracts';
import { Button } from '@norde/ui/components/button';
import { Input } from '@norde/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent } from '@norde/ui/components/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@norde/ui/components/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@norde/ui/components/tooltip';
import { cn } from '@norde/ui/lib/utils';
import {
  BuildingIcon,
  IdCardIcon,
  LandmarkIcon,
  Loader2Icon,
  SearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { globalSearchAction } from '../search-actions';
import { SEARCH_KINDS_COOKIE, serializeSearchKinds } from '../search-kinds';

const SEARCH_DEBOUNCE_MS = 300;
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

interface KindCopy {
  readonly label: string;
  readonly icon: LucideIcon;
  /** El listado del módulo, filtrado por el texto buscado. */
  readonly listHref: (q: string) => string;
  readonly hitHref: (hit: GlobalSearchHit) => string;
}

const KINDS: Readonly<Record<GlobalSearchKind, KindCopy>> = {
  clients: {
    label: 'Contactos',
    icon: UsersIcon,
    listHref: (q) => `/contactos?q=${encodeURIComponent(q)}`,
    hitHref: (hit) => `/contactos/${hit.id}`,
  },
  properties: {
    label: 'Propiedades',
    icon: BuildingIcon,
    listHref: (q) => `/propiedades?q=${encodeURIComponent(q)}`,
    hitHref: (hit) => `/propiedades/${hit.id}`,
  },
  developments: {
    label: 'Emprendimientos',
    icon: LandmarkIcon,
    listHref: (q) => `/emprendimientos?q=${encodeURIComponent(q)}`,
    hitHref: (hit) => `/emprendimientos/${hit.id}`,
  },
  agents: {
    label: 'Agentes',
    icon: IdCardIcon,
    listHref: (q) => `/mi-empresa/usuarios?q=${encodeURIComponent(q)}`,
    // El panel del usuario se arma con las filas de la página: el filtro por nombre lo trae.
    hitHref: (hit) => `/mi-empresa/usuarios?q=${encodeURIComponent(hit.title)}&panel=${hit.id}`,
  },
};

type Loaded =
  | { readonly key: string; readonly status: 'ready'; readonly result: GlobalSearchResult }
  | { readonly key: string; readonly status: 'error'; readonly message: string };

type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | Omit<Extract<Loaded, { status: 'ready' }>, 'key'>
  | Omit<Extract<Loaded, { status: 'error' }>, 'key'>;

function storeKinds(kinds: readonly GlobalSearchKind[]): void {
  document.cookie = `${SEARCH_KINDS_COOKIE}=${serializeSearchKinds(kinds)}; path=/; max-age=${String(ONE_YEAR_IN_SECONDS)}; samesite=lax`;
}

/** El texto, los tipos elegidos y los resultados (con debounce; una respuesta vieja no pisa). */
function useGlobalSearch(initialKinds: readonly GlobalSearchKind[]) {
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState(initialKinds);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const term = q.trim();
  const key = `${kinds.join(',')}|${term}`;
  const searchable = term.length >= GLOBAL_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!searchable) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      globalSearchAction({ q: term, kinds: [...kinds] }).then(
        (response) => {
          if (stale) return;
          setLoaded(
            response.ok
              ? { key, status: 'ready', result: response.value }
              : { key, status: 'error', message: response.message },
          );
        },
        () => {
          if (!stale) setLoaded({ key, status: 'error', message: UNEXPECTED_ERROR_MESSAGE });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key, term, kinds, searchable]);

  useEffect(() => {
    storeKinds(kinds);
  }, [kinds]);

  function toggleKind(kind: GlobalSearchKind) {
    // Sobre el estado más reciente: dos clics seguidos no se pisan.
    setKinds((chosen) =>
      chosen.includes(kind)
        ? chosen.filter((current) => current !== kind)
        : GLOBAL_SEARCH_KINDS.filter((current) => current === kind || chosen.includes(current)),
    );
  }

  let state: SearchState = { status: 'idle' };
  if (searchable) {
    if (loaded?.key !== key) state = { status: 'loading' };
    else if (loaded.status === 'ready') state = { status: 'ready', result: loaded.result };
    else state = { status: 'error', message: loaded.message };
  }

  return { q, setQ, term, kinds, toggleKind, state };
}

type Search = ReturnType<typeof useGlobalSearch>;

/** Los resultados en el orden en que se recorren con las flechas. */
function flatHits(state: SearchState): { readonly href: string; readonly id: string }[] {
  if (state.status !== 'ready') return [];
  return state.result.groups.flatMap((group) =>
    group.items.map((hit) => ({
      id: `${group.kind}:${hit.id}`,
      href: KINDS[group.kind].hitHref(hit),
    })),
  );
}

function KindToggles({ search }: { readonly search: Search }) {
  return (
    <div role="group" aria-label="Buscar en" className="flex items-center gap-0.5">
      {GLOBAL_SEARCH_KINDS.map((kind) => {
        const { label, icon: Icon } = KINDS[kind];
        const active = search.kinds.includes(kind);
        return (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => {
                  search.toggleKind(kind);
                }}
                className={cn(
                  'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{active ? `Buscando en ${label.toLowerCase()}` : label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function scopeHint(kinds: readonly GlobalSearchKind[]): string {
  if (kinds.length === 0) return 'Buscando en todo';
  return `Buscando en ${kinds.map((kind) => KINDS[kind].label.toLowerCase()).join(', ')}`;
}

function HitRow({
  group,
  hit,
  active,
  optionId,
  onNavigate,
}: {
  readonly group: GlobalSearchGroup;
  readonly hit: GlobalSearchHit;
  readonly active: boolean;
  readonly optionId: string;
  readonly onNavigate: () => void;
}) {
  return (
    <li role="presentation">
      <Link
        id={optionId}
        role="option"
        aria-selected={active}
        // Rutas armadas en `KINDS`: typedRoutes no puede verificar strings construidos.
        href={KINDS[group.kind].hitHref(hit) as Route}
        onClick={onNavigate}
        tabIndex={-1}
        className={cn(
          'flex min-w-0 flex-col rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent',
          active && 'bg-accent',
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          {hit.code !== undefined && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{hit.code}</span>
          )}
          <span className="truncate font-medium text-foreground">
            {hit.title === '' ? 'Sin nombre' : hit.title}
          </span>
        </span>
        {hit.detail !== undefined && (
          <span className="truncate text-xs text-muted-foreground">{hit.detail}</span>
        )}
      </Link>
    </li>
  );
}

function Results({
  search,
  activeId,
  listboxId,
  onNavigate,
}: {
  readonly search: Search;
  readonly activeId: string | undefined;
  readonly listboxId: string;
  readonly onNavigate: () => void;
}) {
  const { state, term } = search;
  let body: ReactNode;
  if (state.status === 'idle') {
    body = <p className="px-2 py-3 text-sm text-muted-foreground">Escribí al menos dos letras.</p>;
  } else if (state.status === 'loading') {
    body = (
      <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        Buscando…
      </p>
    );
  } else if (state.status === 'error') {
    body = <p className="px-2 py-3 text-sm text-destructive">{state.message}</p>;
  } else if (state.result.groups.every((group) => group.total === 0)) {
    body = (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        {state.result.groups.length === 0
          ? 'No tenés acceso a lo que elegiste buscar.'
          : `No encontramos nada para "${term}".`}
      </p>
    );
  } else {
    body = state.result.groups
      .filter((group) => group.total > 0)
      .map((group) => {
        const { label, icon: Icon, listHref } = KINDS[group.kind];
        return (
          <section key={group.kind} className="py-1" aria-label={label}>
            <header className="flex items-center justify-between gap-2 px-2 pt-1 pb-0.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
                {label}
              </h3>
              {group.total > group.items.length && (
                <Link
                  href={listHref(term) as Route}
                  onClick={onNavigate}
                  tabIndex={-1}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver los {group.total}
                </Link>
              )}
            </header>
            <ul role="presentation">
              {group.items.map((hit) => {
                const id = `${group.kind}:${hit.id}`;
                return (
                  <HitRow
                    key={id}
                    group={group}
                    hit={hit}
                    active={activeId === id}
                    optionId={`${listboxId}-${id}`}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </ul>
          </section>
        );
      });
  }

  return (
    <div id={listboxId} role="listbox" aria-label="Resultados de la búsqueda">
      {body}
      <p className="border-t border-border px-2 pt-2 text-xs text-muted-foreground">
        {scopeHint(search.kinds)}
      </p>
    </div>
  );
}

/** El input con los tipos a la derecha. Las flechas recorren los resultados y Enter abre uno. */
function SearchField({
  search,
  activeId,
  listboxId,
  inputRef,
  onActiveChange,
  onSubmit,
  onFocus,
  onEscape,
  autoFocus = false,
}: {
  readonly search: Search;
  readonly activeId: string | undefined;
  readonly listboxId: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly onActiveChange: (delta: 1 | -1) => void;
  readonly onSubmit: () => void;
  readonly onFocus?: () => void;
  readonly onEscape: () => void;
  readonly autoFocus?: boolean;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      onActiveChange(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    } else if (event.key === 'Escape') {
      onEscape();
    }
  }

  return (
    <div className="relative flex w-full items-center">
      <SearchIcon
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={search.state.status !== 'idle'}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...(activeId === undefined ? {} : { 'aria-activedescendant': `${listboxId}-${activeId}` })}
        aria-label="Buscar contactos, propiedades, emprendimientos o agentes"
        placeholder="Buscar…"
        autoComplete="off"
        autoFocus={autoFocus}
        value={search.q}
        onChange={(event) => {
          search.setQ(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        {...(onFocus ? { onFocus } : {})}
        className="pr-[124px] pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-1">
        <KindToggles search={search} />
      </div>
    </div>
  );
}

/** Estado de la navegación con teclado sobre los resultados. */
function useActiveHit(search: Search) {
  const hits = flatHits(search.state);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const current = hits.some((hit) => hit.id === activeId) ? activeId : undefined;

  function move(delta: 1 | -1) {
    if (hits.length === 0) return;
    const index = hits.findIndex((hit) => hit.id === current);
    const next = index === -1 ? (delta === 1 ? 0 : hits.length - 1) : index + delta;
    setActiveId(hits[(next + hits.length) % hits.length]?.id);
  }

  const href = hits.find((hit) => hit.id === current)?.href ?? hits[0]?.href;
  return { activeId: current, move, href };
}

/**
 * Buscador de la barra superior: contactos, propiedades, emprendimientos y agentes. Los íconos de
 * la derecha eligen dónde buscar (uno o varios); sin ninguno elegido busca en todos. En desktop los
 * resultados se despliegan bajo el input; en mobile, un botón abre el buscador arriba.
 */
export function GlobalSearch({
  initialKinds,
}: {
  /** Los tipos elegidos la última vez (cookie). */
  readonly initialKinds: readonly GlobalSearchKind[];
}) {
  const search = useGlobalSearch(initialKinds);
  const router = useRouter();
  const listboxId = useId();
  const active = useActiveHit(search);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Ctrl+K (o Cmd+K) lleva al buscador desde cualquier pantalla.
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (window.matchMedia('(min-width: 768px)').matches) {
        inputRef.current?.focus();
        setOpen(true);
      } else {
        setMobileOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function close() {
    setOpen(false);
    setMobileOpen(false);
  }

  /** Al abrir un resultado, el buscador queda vacío para la próxima búsqueda. */
  function navigated() {
    close();
    search.setQ('');
  }

  function submit() {
    if (active.href === undefined) return;
    navigated();
    // Rutas armadas en `KINDS`: typedRoutes no puede verificar strings construidos.
    router.push(active.href as Route);
  }

  const fieldProps = {
    search,
    activeId: active.activeId,
    listboxId,
    onActiveChange: active.move,
    onSubmit: submit,
    onEscape: close,
  };

  return (
    <>
      <Popover open={open && search.term !== ''} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="hidden w-[300px] md:block lg:w-[420px]">
            <SearchField
              {...fieldProps}
              inputRef={inputRef}
              onFocus={() => {
                setOpen(true);
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="max-h-[min(70vh,520px)] w-(--radix-popover-trigger-width) overflow-y-auto p-1.5"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            // Click en el input o en los íconos: sigue abierto.
            if (event.target instanceof Node && anchorRef.current?.contains(event.target)) {
              event.preventDefault();
            }
          }}
        >
          <Results
            search={search}
            activeId={active.activeId}
            listboxId={listboxId}
            onNavigate={navigated}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Buscar"
        onClick={() => {
          setMobileOpen(true);
        }}
      >
        <SearchIcon className="size-4" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="top" showCloseButton={false} className="gap-2 p-3">
          <SheetTitle className="sr-only">Buscar</SheetTitle>
          <SheetDescription className="sr-only">
            Contactos, propiedades, emprendimientos o agentes
          </SheetDescription>
          {/* Montado solo en mobile: el input de desktop es otro. */}
          {mobileOpen && (
            <SearchField {...fieldProps} listboxId={`${listboxId}-mobile`} autoFocus />
          )}
          {search.term !== '' && (
            <div className="max-h-[70dvh] overflow-y-auto">
              <Results
                search={search}
                activeId={active.activeId}
                listboxId={`${listboxId}-mobile`}
                onNavigate={navigated}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
