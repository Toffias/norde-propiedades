/**
 * Tutoriales guiados del panel: un recorrido por pantalla, para que alguien nuevo en Norde aprenda
 * a usarla. Los abre el botón "?" de la barra superior (`HelpTourButton`) con driver.js.
 */

/** Un paso del recorrido. Sin `target`, se muestra centrado (una introducción o un cierre). */
export interface TourStep {
  /** El `data-tour` del elemento a resaltar. */
  readonly target?: string;
  readonly title: string;
  readonly description: string;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}

export interface Tour {
  /** Las rutas del recorrido. `:id` es el UUID de una entidad (ej. `/propiedades/:id`). */
  readonly paths: readonly string[];
  readonly steps: readonly TourStep[];
}

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function matches(pattern: string, pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const source = pattern
    .split('/')
    .map((segment) => (segment === ':id' ? UUID_PATTERN : segment))
    .join('/');
  return new RegExp(`^${source}$`, 'i').test(normalized);
}

/** El recorrido de la pantalla, si tiene. */
export function tourFor(pathname: string, tours: readonly Tour[]): Tour | undefined {
  return tours.find((tour) => tour.paths.some((pattern) => matches(pattern, pathname)));
}

/** El selector del elemento de un paso. */
export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}
