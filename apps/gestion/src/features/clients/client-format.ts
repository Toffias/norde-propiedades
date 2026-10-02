import type { ClientUserRef } from '@norde/core/clients/contracts';

import { EMPTY_VALUE } from '../../lib/format';

// Formato de los datos de un contacto para mostrarlos. Los datos llegan crudos (E.164) o ya
// enmascarados por el caso de uso.

/** Un contacto sin nombre (entró por WhatsApp sin decirlo). */
export function clientName(name: string | undefined): string {
  return name ?? 'Sin nombre';
}

export function userName(user: ClientUserRef | undefined): string {
  if (user === undefined) return EMPTY_VALUE;
  return user.name ?? 'Usuario inactivo';
}

const AR_MOBILE_AMBA = /^\+549(11)(\d{4})(\d{4})$/;
const AR_LANDLINE_AMBA = /^\+54(11)(\d{4})(\d{4})$/;

/** `+5491166899124` → `+54 9 11 6689-9124`. Otros números (y los enmascarados) quedan como vienen. */
export function formatPhone(e164: string): string {
  const mobile = AR_MOBILE_AMBA.exec(e164);
  if (mobile) return `+54 9 ${mobile[1] ?? ''} ${mobile[2] ?? ''}-${mobile[3] ?? ''}`;
  const landline = AR_LANDLINE_AMBA.exec(e164);
  if (landline) return `+54 ${landline[1] ?? ''} ${landline[2] ?? ''}-${landline[3] ?? ''}`;
  return e164;
}

/**
 * Link para escribirle por WhatsApp (`wa.me` usa el número sin el `+`). Un celular argentino
 * cargado sin el 9 de móvil ("11 6689-9124") en WhatsApp lleva el 9: `549…`.
 */
export function whatsappHref(e164: string): string {
  const digits = e164.replace(/^\+/, '');
  const whatsapp =
    digits.startsWith('54') && !digits.startsWith('549') ? `549${digits.slice(2)}` : digits;
  return `https://wa.me/${whatsapp}`;
}
