import type { Result } from '@norde/core/shared';

import { messageForError, UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';

// Cómo llega cada widget de Inicio a la pantalla: con datos, con un error o sin permiso.

export type WidgetState<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string }
  /** Sin permiso sobre ese módulo: el widget no se muestra. */
  | { readonly kind: 'hidden' };

/** Los errores esperados de las queries de Inicio. */
type HomeError = { readonly type: 'Forbidden' } | { readonly type: 'InvalidInput' };

export function widgetState<T>(result: Result<T, HomeError>): WidgetState<T> {
  if (result.isOk()) return { kind: 'ok', value: result.value };
  switch (result.error.type) {
    case 'Forbidden':
      return { kind: 'hidden' };
    case 'InvalidInput':
      return {
        kind: 'error',
        message: messageForError(result.error, {
          InvalidInput: 'Los filtros de Inicio no son válidos. Revisalos y probá de nuevo.',
        }),
      };
    default:
      return { kind: 'error', message: UNEXPECTED_ERROR_MESSAGE };
  }
}
