import {
  OPERATION_LABELS,
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  type DocumentContact,
  type PanelPropertyDetail,
  type PdfPrice,
} from '@norde/core/properties';

import { formatCount, formatMoney, formatPhone, formatSquareMeters } from './format';
import type { PdfKeyFact } from './kit';

// Lo que los PDF de una propiedad escriben igual: el tipo, la operación, el precio, los datos
// clave, el contacto y la nota legal.

export const LEGAL_NOTE =
  'La información, las medidas y los gastos son aproximados y deben ratificarse con la documentación de la propiedad. Las fotos no son vinculantes.';

/** "Departamento", "Casa"; un tipo desconocido, tal cual. */
export function kindLabel(kind: string): string {
  const known = PROPERTY_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : PROPERTY_KIND_LABELS[known];
}

/** "Venta", "Alquiler", "Alquiler temporario". */
export function operationLabel(price: PdfPrice): string {
  const operation = OPERATION_LABELS[price.operation].replace(/^en /, '');
  return `${operation.charAt(0).toUpperCase()}${operation.slice(1)}`;
}

export /** El precio, o "Consultar precio" si no se muestra. */
function amount(price: PdfPrice): string {
  return price.priceCents === undefined
    ? 'Consultar precio'
    : formatMoney(price.currency, price.priceCents);
}

/** "Dirección · Tel. … · WhatsApp … · email", sin los datos que falten. */
export function contactLine(contact: DocumentContact | undefined): string | undefined {
  if (contact === undefined) return undefined;
  const parts = [
    contact.address,
    contact.phone === undefined ? undefined : `Tel. ${formatPhone(contact.phone)}`,
    contact.whatsapp === undefined ? undefined : `WhatsApp ${formatPhone(contact.whatsapp)}`,
    contact.email,
  ].filter((part): part is string => part !== undefined && part !== '');
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/** Los datos que más se miran, con su ícono. Sin dato, no aparece. */
export function keyFacts(property: PanelPropertyDetail): PdfKeyFact[] {
  const c = property.characteristics;
  const surface = c.surfaceCoveredM2 ?? c.surfaceTotalM2;
  const facts: (PdfKeyFact | undefined)[] = [
    c.rooms === undefined
      ? undefined
      : { icon: 'rooms', text: formatCount(c.rooms, 'amb.', 'amb.') },
    c.bedrooms === undefined
      ? undefined
      : { icon: 'bedrooms', text: formatCount(c.bedrooms, 'dorm.', 'dorm.') },
    c.bathrooms === undefined
      ? undefined
      : { icon: 'bathrooms', text: formatCount(c.bathrooms, 'baño', 'baños') },
    surface === undefined
      ? undefined
      : {
          icon: 'surface',
          text: `${formatSquareMeters(surface)}${c.surfaceCoveredM2 === undefined ? '' : ' cub.'}`,
        },
    c.parkingSpaces === undefined || c.parkingSpaces === 0
      ? undefined
      : { icon: 'parking', text: formatCount(c.parkingSpaces, 'cochera', 'cocheras') },
  ];
  return facts.filter((fact): fact is PdfKeyFact => fact !== undefined);
}
