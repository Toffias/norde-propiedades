'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useId } from 'react';

import { PAGE_SIZES, pageCount } from '../lib/pagination';
import { Button } from './button';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface TablePaginationProps {
  /** Página actual, empieza en 1. */
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageSizes?: readonly number[];
  readonly onPageChange: (page: number) => void;
  /** Cambiar el tamaño vuelve a la página 1 (lo resuelve quien maneja el estado). */
  readonly onPageSizeChange: (pageSize: number) => void;
}

/** Pie de la card de una tabla. No se dibuja si no hay filas. */
export function TablePagination({
  page,
  pageSize,
  total,
  pageSizes = PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const sizeId = useId();
  if (total <= 0) return null;

  const pages = pageCount(total, pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3 print:hidden">
      <div className="flex items-center gap-2">
        <Label htmlFor={sizeId} className="text-xs font-normal text-muted-foreground">
          Filas por página
        </Label>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
          }}
        >
          <SelectTrigger id={sizeId} size="sm" className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          Página {page} de {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Página siguiente"
          disabled={page >= pages}
          onClick={() => {
            onPageChange(page + 1);
          }}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
