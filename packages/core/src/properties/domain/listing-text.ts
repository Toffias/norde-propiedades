import {
  OPERATION_LABELS,
  PROPERTY_KIND_LABELS,
  type PropertyKind,
  type PropertyOperationKind,
} from './property-catalog';

/**
 * Dirección para publicar a partir de la calle y la altura privadas: la altura se redondea a la
 * centena ("Gurruchaga al 1800"), así la web y los portales no muestran el número exacto. Sin
 * altura numérica, solo la calle.
 */
export function suggestPublishAddress(street: string, streetNumber: string | undefined): string {
  const name = street.trim();
  const digits = /^\d+/.exec(streetNumber?.trim() ?? '')?.[0];
  if (digits === undefined) return name;
  const hundred = Math.floor(Number(digits) / 100) * 100;
  return `${name} al ${hundred}`;
}

/** Título para portales: "Departamento en venta en Palermo". */
export function suggestPortalTitle(input: {
  readonly kind: PropertyKind;
  readonly operation: PropertyOperationKind;
  readonly neighborhood: string;
}): string {
  const place = input.neighborhood.trim();
  const base = `${PROPERTY_KIND_LABELS[input.kind]} ${OPERATION_LABELS[input.operation]}`;
  return place === '' ? base : `${base} en ${place}`;
}

/** Slug para la web: el título sin acentos ni símbolos, más el código (que es único). */
export function propertySlug(title: string, code: string): string {
  const words = `${title} ${code}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return words === '' ? code.toLowerCase() : words;
}
