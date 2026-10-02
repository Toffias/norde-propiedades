import { z } from 'zod';

import type { SearchParams } from './list-params';

// Panel lateral de alta y edición en la URL: `?panel=new` (alta) o `?panel=<id>&tab=permissions`
// (edición, con la pestaña). Así el servidor carga los datos del panel, y se puede recargar,
// compartir el link y volver atrás. Los params del panel no tocan los de la grilla.

export const PANEL_PARAM = 'panel';
export const PANEL_TAB_PARAM = 'tab';
/** Página de una grilla dentro del panel (ej. los miembros de un equipo). */
export const PANEL_PAGE_PARAM = 'panelPage';

/** Todo lo que vive mientras el panel está abierto: se borra al cerrarlo. */
export const PANEL_PARAMS = [PANEL_PARAM, PANEL_TAB_PARAM, PANEL_PAGE_PARAM] as const;

export type PanelState =
  /** `tab`: en una pantalla con más de un catálogo, cuál se da de alta. */
  | { readonly kind: 'new'; readonly tab?: string | undefined }
  | { readonly kind: 'edit'; readonly id: string; readonly tab: string | undefined };

const PanelSchema = z.union([z.literal('new'), z.uuid()]);
const TabSchema = z
  .string()
  .regex(/^[a-z-]{1,30}$/)
  .optional();
const PageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

/** Lee el panel de los query params. Un valor inválido (URL editada a mano) deja el panel cerrado. */
export function readPanel(get: (key: string) => string | null | undefined): PanelState | undefined {
  const panel = PanelSchema.safeParse(get(PANEL_PARAM));
  if (!panel.success) return undefined;
  const tab = TabSchema.safeParse(get(PANEL_TAB_PARAM) ?? undefined);
  if (panel.data === 'new') return { kind: 'new', tab: tab.success ? tab.data : undefined };
  return { kind: 'edit', id: panel.data, tab: tab.success ? tab.data : undefined };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Para la página (Server Component). */
export function parsePanelParams(params: SearchParams): PanelState | undefined {
  return readPanel((key) => first(params[key]));
}

/** Página de la grilla del panel; 1 si falta o no es válida. */
export function parsePanelPage(params: SearchParams): number {
  return PageSchema.parse(first(params[PANEL_PAGE_PARAM]) ?? 1);
}

/**
 * Lo que la página carga para el panel de edición. Lleva el `id` para que el panel no muestre los
 * datos de otro mientras navega.
 */
export type PanelData<T> =
  | { readonly id: string; readonly ok: true; readonly value: T }
  | { readonly id: string; readonly ok: false; readonly message: string };
