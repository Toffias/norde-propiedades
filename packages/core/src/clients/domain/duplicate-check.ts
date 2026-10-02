import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { Client } from './client';

/** Los datos de contacto con que se busca si un cliente ya existe. */
export interface ContactKeys {
  readonly phones: readonly Phone[];
  readonly emails: readonly Email[];
}

/**
 * El cliente que ya existe con estos datos, entre los que comparten un teléfono o email. Gana el
 * que coincide por teléfono (es la clave más confiable) y, entre iguales, el que no está borrado.
 * Lo usan el alta manual y los contactos entrantes: la regla es una sola.
 */
export function findExistingClient(
  candidates: readonly Client[],
  contact: ContactKeys,
): Client | undefined {
  const byPhone = candidates.filter((c) =>
    c.sharesContactWith({ phones: contact.phones, emails: [] }),
  );
  const byEmail = candidates.filter((c) =>
    c.sharesContactWith({ phones: [], emails: contact.emails }),
  );
  const pick = (list: readonly Client[]) => list.find((c) => !c.isDeleted) ?? list[0];
  return pick(byPhone) ?? pick(byEmail);
}

/** Los otros clientes que ya usan alguno de estos teléfonos o emails. */
export function contactConflicts(
  client: Client,
  candidates: readonly Client[],
  contact: ContactKeys,
): Client[] {
  return candidates.filter((c) => c.id !== client.id && c.sharesContactWith(contact));
}

/** Nombre comparable: sin mayúsculas, acentos ni espacios de más. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Posibles duplicados: mismo nombre pero ningún teléfono ni email en común. No se bloquea el
 * alta; un humano decide si es la misma persona.
 */
export function possibleDuplicates(
  name: string,
  sameName: readonly Client[],
  contact: ContactKeys,
): Client[] {
  const key = normalizeName(name);
  if (key === '') return [];
  return sameName.filter(
    (c) =>
      !c.isDeleted &&
      c.name !== undefined &&
      normalizeName(c.name) === key &&
      !c.sharesContactWith(contact),
  );
}
