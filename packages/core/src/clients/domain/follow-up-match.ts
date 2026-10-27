import type { Id } from '../../shared/domain/id';

import type { ClientId } from './client';
import type { FeaturedListingId } from './featured-listing';
import type { SavedSearchId } from './saved-search';

export type FollowUpMatchId = Id<'FollowUpMatch'>;

/**
 * Por qué una propiedad entra en los seguimientos automáticos de un cliente: es nueva para una de
 * sus búsquedas o le bajaron el precio (a una que coincide con sus búsquedas o a una destacada).
 */
export const FOLLOW_UP_REASONS = ['new_listing', 'price_drop'] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

/** Qué la hizo coincidir: una búsqueda guardada con envío automático o una destacada. */
export type FollowUpSource =
  | { readonly kind: 'saved_search'; readonly savedSearchId: SavedSearchId }
  | { readonly kind: 'featured'; readonly featuredListingId: FeaturedListingId };

/** El precio de la operación que coincidió, al detectarla. */
export interface FollowUpPrice {
  readonly operation: string;
  readonly currency: string;
  readonly priceCents: bigint | undefined;
}

/**
 * Una propiedad que el cruce con el stock encontró para un cliente y que todavía hay que mandarle
 * en el resumen del día. Una propiedad entra una sola vez por cliente como nueva, y
 * una vez por cada precio al que bajó: el repositorio descarta la repetida.
 */
export interface FollowUpMatch {
  readonly id: FollowUpMatchId;
  readonly clientId: ClientId;
  /** Propiedad del módulo properties, por ID. */
  readonly propertyId: string;
  readonly reason: FollowUpReason;
  readonly source: FollowUpSource;
  readonly price: FollowUpPrice;
  readonly detectedAt: Date;
}

/**
 * Bajó el precio: los dos precios están cargados y el nuevo es menor. Un cambio de moneda llega
 * sin precio anterior (no se comparan) y una suba no se avisa.
 */
export function isPriceDrop(
  oldPriceCents: bigint | undefined,
  newPriceCents: bigint | undefined,
): boolean {
  return (
    oldPriceCents !== undefined && newPriceCents !== undefined && newPriceCents < oldPriceCents
  );
}

/** El precio de una operación de la propiedad, para guardarlo con la coincidencia. */
export function followUpPrice(
  operations: readonly {
    readonly operation: string;
    readonly currency: string;
    readonly priceCents: bigint | undefined;
  }[],
  operation: string,
): FollowUpPrice | undefined {
  const found = operations.find((o) => o.operation === operation);
  return found === undefined
    ? undefined
    : { operation: found.operation, currency: found.currency, priceCents: found.priceCents };
}

/** Las coincidencias que entran en el resumen de hoy. */
export interface FollowUpDigest {
  readonly matches: readonly FollowUpMatch[];
  /** Propiedades del envío, sin repetir, en el orden en que se encontraron. */
  readonly propertyIds: readonly string[];
}

/**
 * Arma el resumen del día de un cliente: las propiedades más viejas primero, hasta `max` (lo que
 * entra en un envío). Una propiedad que es nueva y además bajó de precio va una sola vez, con sus
 * dos coincidencias. Las que no entran quedan para el resumen del día siguiente.
 */
export function pickFollowUpDigest(pending: readonly FollowUpMatch[], max: number): FollowUpDigest {
  const ordered = [...pending].sort(
    (a, b) => a.detectedAt.getTime() - b.detectedAt.getTime() || a.id.localeCompare(b.id),
  );
  const propertyIds: string[] = [];
  for (const match of ordered) {
    if (propertyIds.length >= max) break;
    if (!propertyIds.includes(match.propertyId)) propertyIds.push(match.propertyId);
  }
  return {
    matches: ordered.filter((match) => propertyIds.includes(match.propertyId)),
    propertyIds,
  };
}

/** Lo que dice el email del resumen. Es fijo: no hay plantilla para editar (#106). */
export interface FollowUpDigestText {
  readonly subject: string;
  readonly message: string;
}

/** El asunto y el mensaje del resumen, según haya propiedades nuevas, bajas de precio o las dos. */
export function followUpDigestText(input: {
  readonly companyName: string;
  readonly firstName: string | undefined;
  readonly matches: readonly FollowUpMatch[];
}): FollowUpDigestText {
  const newCount = new Set(
    input.matches.filter((m) => m.reason === 'new_listing').map((m) => m.propertyId),
  ).size;
  const dropCount = new Set(
    input.matches.filter((m) => m.reason === 'price_drop').map((m) => m.propertyId),
  ).size;
  const greeting = input.firstName === undefined ? '¡Hola!' : `¡Hola, ${input.firstName}!`;
  const lines = [greeting];
  if (newCount > 0) {
    lines.push(
      newCount === 1
        ? 'Encontramos una propiedad nueva que coincide con lo que estás buscando.'
        : `Encontramos ${newCount.toLocaleString('es-AR')} propiedades nuevas que coinciden con lo que estás buscando.`,
    );
  }
  if (dropCount > 0) {
    const drop =
      dropCount === 1
        ? 'bajó de precio una propiedad que te puede interesar.'
        : `bajaron de precio ${dropCount.toLocaleString('es-AR')} propiedades que te pueden interesar.`;
    lines.push(newCount > 0 ? `Además, ${drop}` : capitalize(drop));
  }

  const subject =
    newCount > 0 && dropCount > 0
      ? 'propiedades nuevas y bajas de precio para vos'
      : newCount > 0
        ? newCount === 1
          ? 'una propiedad nueva para vos'
          : `${newCount.toLocaleString('es-AR')} propiedades nuevas para vos`
        : dropCount === 1
          ? 'bajó de precio una propiedad que te interesa'
          : 'bajaron de precio propiedades que te interesan';
  return { subject: `${input.companyName}: ${subject}`, message: lines.join('\n') };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
