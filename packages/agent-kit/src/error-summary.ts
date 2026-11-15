/** Largo máximo del mensaje que se loguea de un error. */
const MAX_MESSAGE_CHARS = 300;

export interface ErrorSummary {
  readonly name: string;
  readonly message: string;
}

/**
 * Lo que se puede loguear de un error sin filtrar datos personales: el nombre y la primera línea
 * del mensaje, recortada. Nunca el error entero: el de Drizzle trae los parámetros de la consulta
 * (teléfonos, emails) en la segunda línea, y los del SDK de agentes cargan el estado del turno con
 * todos los mensajes de la conversación.
 */
export function errorSummary(error: unknown): ErrorSummary {
  if (!(error instanceof Error)) return { name: typeof error, message: '' };
  const firstLine = error.message.split('\n', 1)[0] ?? '';
  return {
    name: error.name,
    message:
      firstLine.length > MAX_MESSAGE_CHARS
        ? `${firstLine.slice(0, MAX_MESSAGE_CHARS)}…`
        : firstLine,
  };
}
