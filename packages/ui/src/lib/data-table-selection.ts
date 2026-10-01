// Selección de una grilla paginada en el servidor. Se marcan filas de la página actual, o se pasa a
// "todos los que cumplen el filtro": en ese caso la acción masiva recibe el filtro, no los IDs.

export type DataTableSelection =
  { readonly kind: 'ids'; readonly ids: readonly string[] } | { readonly kind: 'filter' };

export const EMPTY_SELECTION: DataTableSelection = { kind: 'ids', ids: [] };

/** Cuántas filas abarca la selección. */
export function selectionCount(selection: DataTableSelection, total: number): number {
  return selection.kind === 'filter' ? total : selection.ids.length;
}

/** Estado de selección de TanStack: solo están las filas marcadas. */
export type RowSelectionMap = Record<string, true>;

/** Estado de TanStack para las filas de la página. */
export function toRowSelectionState(
  selection: DataTableSelection,
  pageRowIds: readonly string[],
): RowSelectionMap {
  const selected = selection.kind === 'filter' ? pageRowIds : selection.ids;
  const state: RowSelectionMap = {};
  for (const id of selected) state[id] = true;
  return state;
}

/** Lo que dejó TanStack después de marcar o desmarcar: siempre una selección por IDs. */
export function fromRowSelectionState(state: RowSelectionMap): DataTableSelection {
  return { kind: 'ids', ids: Object.keys(state) };
}

/**
 * Se ofrece "seleccionar los N que cumplen el filtro" cuando la página entera está marcada y
 * hay más filas que las de la página.
 */
export function canSelectAllMatching(
  selection: DataTableSelection,
  pageRowIds: readonly string[],
  total: number,
): boolean {
  if (selection.kind === 'filter' || pageRowIds.length === 0) return false;
  const selected = new Set(selection.ids);
  return total > pageRowIds.length && pageRowIds.every((id) => selected.has(id));
}
