import type { ContactChannel } from './contact-channel';

/** Lo que una consulta toma de la propiedad consultada al entrar. */
export interface InquiryPropertyFacts {
  /** Sucursal de la propiedad (la del captador). */
  readonly branchId: string | undefined;
  readonly propertyType: string;
  /** Las operaciones que ofrece: venta, alquiler, temporario. */
  readonly operations: readonly string[];
  readonly neighborhood: string | undefined;
}

/** Prefijos de las etiquetas automáticas: la UI los traduce. */
export const INQUIRY_TAG_KINDS = ['channel', 'operation', 'type', 'neighborhood'] as const;
export type InquiryTagKind = (typeof INQUIRY_TAG_KINDS)[number];

/**
 * Las etiquetas automáticas de una consulta, como códigos `tipo:valor` (`channel:zonaprop`,
 * `operation:sale`, `type:apartment`, `neighborhood:Palermo`): el canal siempre, y de la propiedad
 * consultada (si la hay) sus operaciones, su tipo y su barrio. Sin repetir, en ese orden.
 */
export function inquiryAutoTags(
  channel: ContactChannel,
  property: InquiryPropertyFacts | undefined,
): string[] {
  const tags = [`channel:${channel}`];
  if (property) {
    for (const operation of property.operations) tags.push(`operation:${operation}`);
    tags.push(`type:${property.propertyType}`);
    const neighborhood = property.neighborhood?.trim();
    if (neighborhood) tags.push(`neighborhood:${neighborhood}`);
  }
  return [...new Set(tags)];
}
