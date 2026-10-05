'use client';

import {
  createColumnHelper,
  functionalUpdate,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useMemo, type MouseEvent, type ReactNode } from 'react';

import {
  EMPTY_SELECTION,
  canSelectAllMatching,
  fromRowSelectionState,
  selectionCount,
  toRowSelectionState,
  type DataTableSelection,
} from '../lib/data-table-selection';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { TablePagination } from './table-pagination';

// Grilla del panel: TanStack Table en modo manual. Paginación, orden y filtros los resuelve la query
// del servidor; la grilla recibe solo las filas de la página y avisa los cambios con callbacks
// (en apps/gestion, los callbacks cambian los query params de la URL).

const FEATURES = tableFeatures({ rowSortingFeature, rowSelectionFeature });

/** Lo que puede ser una fila: un objeto (el DTO de la query). */
export type DataTableRow = RowData;

export interface DataTableSort {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

/** Breakpoint desde el que se muestra una columna secundaria (en mobile se oculta; impresa, no). */
export type DataTableBreakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SHOW_FROM: Record<DataTableBreakpoint, string> = {
  sm: 'hidden sm:table-cell print:table-cell',
  md: 'hidden md:table-cell print:table-cell',
  lg: 'hidden lg:table-cell print:table-cell',
  xl: 'hidden xl:table-cell print:table-cell',
  '2xl': 'hidden 2xl:table-cell print:table-cell',
};

export interface DataTableColumn<T extends DataTableRow> {
  /** Si la columna es ordenable, `id` es el campo de orden que acepta el contract de la query. */
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly showFrom?: DataTableBreakpoint;
  /** Clases de la celda y del encabezado (ancho, alineación). */
  readonly className?: string;
  /** El encabezado no se ve (columna de acciones), pero se anuncia al lector de pantalla. */
  readonly hideHeader?: boolean;
}

export interface DataTableProps<T extends DataTableRow> {
  /** Nombre accesible de la tabla ("Contactos"). */
  readonly label: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowId: (row: T) => string;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageSizes?: readonly number[];
  readonly sort?: DataTableSort;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onSortChange?: (sort: DataTableSort) => void;
  /** Hay una navegación en curso: se atenúan las filas actuales en lugar de vaciar la tabla. */
  readonly pending?: boolean;
  /** Filtros, arriba de la tabla y dentro de la card. */
  readonly toolbar?: ReactNode;
  /** Qué mostrar sin filas ("No hay contactos con estos filtros"). */
  readonly empty: ReactNode;
  /** Sin `onSelectionChange` no hay casillas. */
  readonly selection?: DataTableSelection;
  readonly onSelectionChange?: (selection: DataTableSelection) => void;
  /** Acciones masivas sobre la selección; se muestran cuando hay algo marcado. */
  readonly bulkActions?: (selection: DataTableSelection, count: number) => ReactNode;
  /**
   * Clic en la fila (ej. abrir la ficha). No se dispara desde los controles de la fila (links,
   * botones, casillas, menús) ni al seleccionar texto. Con teclado, la fila necesita igual un link.
   * Sin esto, tocar la fila es como tocar el link de la primera columna (el nombre), si tiene.
   */
  readonly onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void;
}

/** Controles de la fila que tienen su propio clic. */
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="checkbox"], [role="menuitem"]';

/** Marca la celda de la primera columna: su link es el de la fila. */
const ROW_LINK_CELL = 'data-row-link';

/**
 * Sin `onRowClick`: tocar la fila sigue el link de la primera columna. Con Ctrl o Cmd, como un
 * link, se abre en otra pestaña.
 */
function followRowLink(event: MouseEvent<HTMLTableRowElement>) {
  const link = event.currentTarget.querySelector<HTMLAnchorElement>(`[${ROW_LINK_CELL}] a[href]`);
  if (link === null) return;
  if (event.ctrlKey || event.metaKey) {
    window.open(link.href, '_blank', 'noopener');
    return;
  }
  link.click();
}

function isRowClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target;
  // Los menús y diálogos de una celda se renderizan en un portal: el evento llega por React, pero
  // el elemento no está dentro de la fila.
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  if (target.closest(INTERACTIVE) !== null) return false;
  const selected = window.getSelection()?.toString() ?? '';
  return selected === '';
}

export function DataTable<T extends DataTableRow>({
  label,
  columns,
  rows,
  getRowId,
  total,
  page,
  pageSize,
  pageSizes,
  sort,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  pending = false,
  toolbar,
  empty,
  selection = EMPTY_SELECTION,
  onSelectionChange,
  bulkActions,
  onRowClick,
}: DataTableProps<T>) {
  const selectable = onSelectionChange !== undefined;
  const pageRowIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);

  const columnDefs = useMemo(() => {
    const helper = createColumnHelper<typeof FEATURES, T>();
    // Columnas con accessor (devuelve la fila entera): TanStack solo deja ordenar las que tienen uno.
    // El valor no se usa para ordenar: el orden es manual, lo hace la query del servidor.
    const defs = columns.map((column) =>
      helper.accessor((row): unknown => row, {
        id: column.id,
        header: column.header,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: column.sortable ?? false,
        sortDescFirst: false,
      }),
    );
    return defs;
  }, [columns]);

  const sorting: SortingState = sort ? [{ id: sort.field, desc: sort.direction === 'desc' }] : [];
  const rowSelection = toRowSelectionState(selection, pageRowIds);
  // TanStack recibe un array mutable; `rows` es de solo lectura para quien llama.
  const data = useMemo(() => [...rows], [rows]);

  const table = useTable({
    features: FEATURES,
    columns: columnDefs,
    data,
    getRowId: (row) => getRowId(row),
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    enableRowSelection: selectable,
    state: { sorting, rowSelection },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [next] = functionalUpdate(updater, sorting);
      if (next && onSortChange) {
        onSortChange({ field: next.id, direction: next.desc ? 'desc' : 'asc' });
      }
    },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
      onSelectionChange?.(fromRowSelectionState(functionalUpdate(updater, rowSelection)));
    },
  });

  const byId = new Map(columns.map((column) => [column.id, column]));
  const count = selectionCount(selection, total);
  const allPageSelected = rows.length > 0 && pageRowIds.every((id) => rowSelection[id]);
  const somePageSelected = pageRowIds.some((id) => rowSelection[id]);

  return (
    <div className="flex flex-col">
      {toolbar !== undefined && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 print:hidden">
          {toolbar}
        </div>
      )}

      {selectable && count > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/40 px-4 py-2 text-sm"
        >
          <span className="font-medium tabular-nums">
            {selection.kind === 'filter'
              ? `Seleccionaste los ${count} que cumplen el filtro`
              : count === 1
                ? '1 seleccionado'
                : `${count} seleccionados`}
          </span>
          {canSelectAllMatching(selection, pageRowIds, total) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                onSelectionChange({ kind: 'filter' });
              }}
            >
              Seleccionar los {total} que cumplen el filtro
            </Button>
          )}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => {
              onSelectionChange(EMPTY_SELECTION);
            }}
          >
            Limpiar selección
          </Button>
          {bulkActions !== undefined && (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {bulkActions(selection, count)}
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="p-5 text-sm leading-normal text-muted-foreground">{empty}</div>
      ) : (
        <>
          <div
            className={cn('table-responsive transition-opacity', pending && 'opacity-60')}
            aria-busy={pending}
          >
            <Table aria-label={label}>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {selectable && (
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          aria-label="Seleccionar la página"
                          checked={
                            allPageSelected ? true : somePageSelected ? 'indeterminate' : false
                          }
                          onCheckedChange={(checked) => {
                            table.toggleAllPageRowsSelected(checked === true);
                          }}
                        />
                      </TableHead>
                    )}
                    {group.headers.map((header) => {
                      const column = byId.get(header.column.id);
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className={cn(
                            column?.showFrom && SHOW_FROM[column.showFrom],
                            column?.className,
                            // La alineación de la columna es para sus celdas: el encabezado va al medio.
                            'align-middle',
                          )}
                        >
                          {column?.hideHeader ? (
                            <span className="sr-only">{column.header}</span>
                          ) : header.column.getCanSort() ? (
                            <button
                              type="button"
                              className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {column?.header}
                              {sorted === 'asc' ? (
                                <ArrowUpIcon className="h-3.5 w-3.5" aria-hidden />
                              ) : sorted === 'desc' ? (
                                <ArrowDownIcon className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <ChevronsUpDownIcon
                                  className="h-3.5 w-3.5 opacity-50"
                                  aria-hidden
                                />
                              )}
                            </button>
                          ) : (
                            column?.header
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const selected = rowSelection[row.id] === true;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={selected ? 'selected' : undefined}
                      className={cn(
                        onRowClick
                          ? 'cursor-pointer'
                          : 'has-[[data-row-link]_a[href]]:cursor-pointer',
                      )}
                      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
                        if (!isRowClick(event)) return;
                        if (onRowClick) onRowClick(row.original, event);
                        else followRowLink(event);
                      }}
                    >
                      {selectable && (
                        <TableCell
                          className="w-10 pl-4"
                          // Errarle por poco a la casilla no abre la fila.
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <Checkbox
                            aria-label="Seleccionar fila"
                            checked={selected}
                            onCheckedChange={(checked) => {
                              row.toggleSelected(checked === true);
                            }}
                          />
                        </TableCell>
                      )}
                      {row.getAllCells().map((cell, index) => {
                        const column = byId.get(cell.column.id);
                        return (
                          <TableCell
                            key={cell.id}
                            {...(index === 0 ? { [ROW_LINK_CELL]: '' } : {})}
                            className={cn(
                              column?.showFrom && SHOW_FROM[column.showFrom],
                              column?.className,
                            )}
                          >
                            <table.FlexRender cell={cell} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            {...(pageSizes === undefined ? {} : { pageSizes })}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </div>
  );
}

/** Fallback de Suspense de una grilla: misma card, filas grises. */
export function DataTableSkeleton({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" role="status">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** La query de la grilla devolvió un error esperado o falló: mensaje y, si se puede, reintentar. */
export function DataTableError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-5">
      <p className="text-sm leading-normal text-muted-foreground">{message}</p>
      {onRetry !== undefined && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
