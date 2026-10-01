// Errores esperados (`Result` de los casos de uso) → mensajes en español para la UI.
// Cada feature declara su mapa con `satisfies ErrorMessages<SuError>`: si el caso de uso suma un
// error nuevo, el compilador avisa que falta su mensaje.

export interface ExpectedError {
  readonly type: string;
}

type Message<E> = string | ((error: E) => string);

export type ErrorMessages<E extends ExpectedError> = {
  readonly [K in E['type']]: Message<Extract<E, { readonly type: K }>>;
};

/** Para errores inesperados (excepciones): no se muestra el detalle, se loguea en el servidor. */
export const UNEXPECTED_ERROR_MESSAGE = 'Algo salió mal. Probá de nuevo en unos segundos.';

/** Errores que comparten todos los módulos. */
const COMMON_MESSAGES: Readonly<Record<string, string>> = {
  Forbidden: 'No tenés permiso para hacer esto.',
  NotFound: 'No encontramos lo que buscabas. Puede que lo hayan eliminado.',
  InvalidSearch: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  ValidationFailed: 'Revisá los datos marcados y probá de nuevo.',
};

/**
 * Mensaje para un error esperado: primero el mapa de la feature, después los comunes y, si el
 * tipo no se conoce, un mensaje genérico.
 */
export function messageForError<E extends ExpectedError>(
  error: E,
  messages?: Partial<ErrorMessages<E>>,
): string {
  const own: Message<E> | undefined = messages
    ? (Object.entries(messages).find(([type]) => type === error.type)?.[1] as
        Message<E> | undefined) // Object.entries pierde el tipo de la clave; el valor es el de `error.type`.
    : undefined;
  if (typeof own === 'function') return own(error);
  if (typeof own === 'string') return own;
  return COMMON_MESSAGES[error.type] ?? UNEXPECTED_ERROR_MESSAGE;
}
