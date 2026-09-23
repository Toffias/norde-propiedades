/** Las fechas se guardan en UTC y se muestran en la hora de Buenos Aires. */
const DISPLAY_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const longDate = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'long',
  timeZone: DISPLAY_TIME_ZONE,
});

/** "22 de septiembre de 2026". */
export function formatDate(iso: string): string {
  return longDate.format(new Date(iso));
}

/** Nombres unidos en español: "Ana", "Ana y Juan", "Ana, Juan y Sol". */
export function joinNames(names: readonly string[]): string {
  return new Intl.ListFormat('es', { style: 'long', type: 'conjunction' }).format(names);
}
