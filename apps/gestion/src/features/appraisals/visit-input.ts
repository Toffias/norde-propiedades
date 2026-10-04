// La visita se carga con un `datetime-local` en hora de Buenos Aires (UTC−3, sin horario de verano).

const BUENOS_AIRES_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Instante → `AAAA-MM-DDTHH:mm` de Buenos Aires, para el valor inicial del campo. */
export function toVisitInput(value: Date | undefined): string {
  if (value === undefined) return '';
  return new Date(value.getTime() - BUENOS_AIRES_OFFSET_MS).toISOString().slice(0, 16);
}
