// El horario de `BUSINESS.openingHours` (formato schema.org, `Mo-Fr 10:00-18:00`) en texto para
// mostrar: "Lun. a Vie. 10 a 18 h". Así el horario se carga una sola vez y sirve para las dos cosas.

const DAYS: Readonly<Record<string, string>> = {
  Mo: 'Lun.',
  Tu: 'Mar.',
  We: 'Mié.',
  Th: 'Jue.',
  Fr: 'Vie.',
  Sa: 'Sáb.',
  Su: 'Dom.',
};

const SPEC = /^([A-Z][a-z](?:[-,][A-Z][a-z])*) (\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

function time(hours: string, minutes: string): string {
  const hour = String(Number(hours));
  return minutes === '00' ? hour : `${hour}:${minutes}`;
}

function days(spec: string): string | undefined {
  const parts = spec.split(/([-,])/);
  const labels = parts.map((part) => {
    if (part === '-') return ' a ';
    if (part === ',') return ', ';
    return DAYS[part];
  });
  return labels.includes(undefined) ? undefined : labels.join('');
}

/** Una línea por rango, unidas con " · ". Un rango que no se entiende se omite. */
export function formatOpeningHours(specs: readonly string[]): string | null {
  const lines = specs.flatMap((spec) => {
    const match = SPEC.exec(spec.trim());
    if (!match) return [];
    const [, dayPart = '', fromH = '', fromM = '', toH = '', toM = ''] = match;
    const label = days(dayPart);
    return label ? [`${label} ${time(fromH, fromM)} a ${time(toH, toM)} h`] : [];
  });
  return lines.length > 0 ? lines.join(' · ') : null;
}
