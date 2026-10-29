// Íconos que se pueden elegir para cada cifra de Nosotros. Las opciones del CMS y el dibujo en la
// página salen de esta lista.

export const ABOUT_STAT_ICONS = [
  { value: 'years', label: 'Años / trayectoria' },
  { value: 'properties', label: 'Propiedades' },
  { value: 'deals', label: 'Operaciones' },
  { value: 'inquiries', label: 'Consultas' },
  { value: 'locations', label: 'Zonas / localidades' },
  { value: 'services', label: 'Servicios' },
  { value: 'team', label: 'Equipo' },
] as const;

export type AboutStatIcon = (typeof ABOUT_STAT_ICONS)[number]['value'];

/** Para una cifra sin ícono elegido: se deduce del texto ("años en el barrio" → años). */
// En orden: gana la primera que coincide ("servicios: venta, alquiler…" es de servicios).
const GUESSES: readonly (readonly [RegExp, AboutStatIcon])[] = [
  [/servicio/i, 'services'],
  [/año/i, 'years'],
  [/operaci|cierre/i, 'deals'],
  [/consulta|mensaje/i, 'inquiries'],
  [/propiedad|inmueble/i, 'properties'],
  [/barrio|zona|localidad|ciudad/i, 'locations'],
  [/equipo|persona|asesor|cliente/i, 'team'],
];

export function guessStatIcon(label: string): AboutStatIcon | null {
  return GUESSES.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}
