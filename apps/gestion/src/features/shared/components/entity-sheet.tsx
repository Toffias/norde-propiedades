'use client';

import { DataTableError } from '@norde/ui/components/data-table';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@norde/ui/components/sheet';
import { Skeleton } from '@norde/ui/components/skeleton';
import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import {
  PANEL_PAGE_PARAM,
  PANEL_PARAM,
  PANEL_PARAMS,
  PANEL_TAB_PARAM,
  readPanel,
  type PanelState,
} from '../../../lib/panel-params';

export interface PanelNavigation {
  /** El panel abierto. Cambia al instante, antes de que el servidor responda. */
  readonly panel: PanelState | undefined;
  readonly pending: boolean;
  readonly openNew: () => void;
  /** Alta en una pantalla con más de un catálogo: `tab` dice cuál (`?panel=new&tab=...`). */
  readonly openNewIn: (tab: string) => void;
  readonly openEdit: (id: string, tab?: string) => void;
  readonly setTab: (tab: string) => void;
  /** Página de la grilla dentro del panel. */
  readonly setPanelPage: (page: number) => void;
  readonly close: () => void;
}

/**
 * Abre y cierra el panel lateral cambiando los query params de la URL (`lib/panel-params.ts`). Los
 * params de la grilla (página, orden, filtros) quedan como están.
 *
 * `keepTab`: la pantalla ya usa `tab` para lo suyo (la pestaña de una ficha): el panel no lo toca.
 * Sus paneles no tienen pestañas.
 */
export function usePanel(options: { readonly keepTab?: boolean } = {}): PanelNavigation {
  const keepTab = options.keepTab === true;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useMemo(() => readPanel((key) => searchParams.get(key)), [searchParams]);
  const [panel, setOptimisticPanel] = useOptimistic(current);
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (next: PanelState | undefined, changes: Readonly<Record<string, string | undefined>>) => {
      const params = new URLSearchParams(searchParams);
      for (const key of Object.keys(changes)) {
        const value = changes[key];
        if (value === undefined) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      // Misma ruta con otros query params: typedRoutes no puede verificar un string armado.
      const href = `${pathname}${query === '' ? '' : `?${query}`}` as Route;
      startTransition(() => {
        setOptimisticPanel(next);
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router, searchParams, setOptimisticPanel],
  );

  return useMemo((): PanelNavigation => {
    const cleared = Object.fromEntries(
      PANEL_PARAMS.filter((key) => !keepTab || key !== PANEL_TAB_PARAM).map((key) => [
        key,
        undefined,
      ]),
    );
    const tabParam = (tab: string | undefined) => (keepTab ? {} : { [PANEL_TAB_PARAM]: tab });
    return {
      panel,
      pending,
      openNew: () => {
        navigate({ kind: 'new' }, { ...cleared, [PANEL_PARAM]: 'new' });
      },
      openNewIn: (tab) => {
        navigate({ kind: 'new', tab }, { ...cleared, [PANEL_PARAM]: 'new', ...tabParam(tab) });
      },
      openEdit: (id, tab) => {
        navigate({ kind: 'edit', id, tab }, { ...cleared, [PANEL_PARAM]: id, ...tabParam(tab) });
      },
      setTab: (tab) => {
        if (panel?.kind !== 'edit' || keepTab) return;
        navigate({ ...panel, tab }, { [PANEL_TAB_PARAM]: tab, [PANEL_PAGE_PARAM]: undefined });
      },
      setPanelPage: (page) => {
        navigate(panel, { [PANEL_PAGE_PARAM]: page === 1 ? undefined : String(page) });
      },
      close: () => {
        navigate(undefined, cleared);
      },
    };
  }, [keepTab, navigate, panel, pending]);
}

/**
 * El último valor definido. Al cerrar el panel, la página deja de mandar sus datos: así el panel
 * no se vacía mientras dura la animación de cierre.
 */
export function useLastDefined<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) setKept(value);
  return value ?? kept;
}

const WIDTHS = {
  /** Formularios de pocos campos. */
  default: 'sm:max-w-[560px]',
  /** Con pestañas, grillas o listas largas (permisos, miembros). */
  wide: 'sm:max-w-[880px]',
} as const;

/**
 * Panel lateral de alta y edición: la convención del panel para las entidades simples (ver
 * `apps/gestion/CLAUDE.md`). El cuerpo (formulario, pestañas) lo pone cada feature.
 */
export function EntitySheet({
  open,
  onClose,
  title,
  description,
  width = 'default',
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly width?: keyof typeof WIDTHS;
  readonly children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className={cn('flex flex-col gap-0', WIDTHS[width])}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {/* Radix pide una descripción para lectores de pantalla: sin texto, va vacía. */}
          <SheetDescription>{description ?? ''}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Mientras el servidor trae los datos del panel. */
export function SheetLoading() {
  return (
    <SheetBody aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-20 w-full" />
    </SheetBody>
  );
}

/** El panel no se puede abrir: no existe, está en la papelera o no hay permiso. */
export function SheetError({ message }: { readonly message: string }) {
  return (
    <SheetBody>
      <DataTableError message={message} />
    </SheetBody>
  );
}
