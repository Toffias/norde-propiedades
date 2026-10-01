'use client';

import {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableRow,
  type DataTableSort,
} from '@norde/ui/components/data-table';
import { EMPTY_SELECTION, type DataTableSelection } from '@norde/ui/lib/data-table-selection';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import { sortParam, withListParams, type ListParamChanges } from '../../../lib/list-params';

interface ListNavigation {
  /** Navega a la misma ruta con los params cambiados (vuelve a la página 1 si no es la página). */
  readonly setParams: (changes: ListParamChanges) => void;
  readonly pending: boolean;
}

const ListNavigationContext = createContext<ListNavigation | null>(null);

/** Para los filtros del toolbar: comparten la navegación (y el estado `pending`) con la grilla. */
export function useListNavigation(): ListNavigation {
  const navigation = use(ListNavigationContext);
  if (!navigation) {
    throw new Error(
      'useListNavigation se usa dentro de <ServerDataTable> o <ListNavigationProvider>.',
    );
  }
  return navigation;
}

/** Cambia los query params de la ruta actual sin recargar la página entera. */
function useUrlNavigation(): ListNavigation {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParams = useCallback(
    (changes: ListParamChanges) => {
      // Misma ruta con otros query params: typedRoutes no puede verificar un string armado.
      const href =
        `${pathname}${withListParams(new URLSearchParams(searchParams), changes)}` as Route;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return useMemo(() => ({ setParams, pending }), [setParams, pending]);
}

/**
 * La misma navegación por URL de la grilla, para vistas que no son una tabla (tarjetas, mapa): los
 * filtros del toolbar funcionan igual.
 */
export function ListNavigationProvider({ children }: { readonly children: ReactNode }) {
  const navigation = useUrlNavigation();
  return <ListNavigationContext value={navigation}>{children}</ListNavigationContext>;
}

type ControlledProps =
  | 'onPageChange'
  | 'onPageSizeChange'
  | 'onSortChange'
  | 'pending'
  | 'selection'
  | 'onSelectionChange';

export type ServerDataTableProps<T extends DataTableRow> = Omit<
  DataTableProps<T>,
  ControlledProps
> & {
  readonly columns: readonly DataTableColumn<T>[];
  /** Muestra las casillas de selección (para acciones masivas). */
  readonly selectable?: boolean;
};

/**
 * `DataTable` con el estado en la URL. La página (Server Component) parsea los params con el
 * contract de la query y pasa solo las filas de la página; cambiar de página, orden, tamaño o
 * filtro navega y el servidor vuelve a consultar.
 *
 * Las columnas tienen funciones (`cell`), así que se definen en un componente cliente de la feature
 * (ej. `ContactsGrid`) que recibe la `Page<T>` de la página.
 */
export function ServerDataTable<T extends DataTableRow>({
  selectable = false,
  ...props
}: ServerDataTableProps<T>) {
  const searchParams = useSearchParams();
  const navigation = useUrlNavigation();
  const { setParams, pending } = navigation;

  // La selección vale para la vista actual: si cambian los params (otra página, otro filtro),
  // arranca vacía.
  const viewKey = searchParams.toString();
  const [selectionState, setSelectionState] = useState<{
    readonly viewKey: string;
    readonly selection: DataTableSelection;
  }>({ viewKey, selection: EMPTY_SELECTION });
  const selection = selectionState.viewKey === viewKey ? selectionState.selection : EMPTY_SELECTION;

  return (
    <ListNavigationContext value={navigation}>
      <DataTable
        {...props}
        pending={pending}
        onPageChange={(page) => {
          setParams({ page });
        }}
        onPageSizeChange={(pageSize) => {
          setParams({ pageSize });
        }}
        onSortChange={(sort: DataTableSort) => {
          setParams({ sort: sortParam(sort) });
        }}
        {...(selectable
          ? {
              selection,
              onSelectionChange: (next: DataTableSelection) => {
                setSelectionState({ viewKey, selection: next });
              },
            }
          : {})}
      />
    </ListNavigationContext>
  );
}
