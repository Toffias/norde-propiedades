// Cifras que se derivan del precio de una operación, para la ficha del panel.

/**
 * El precio por m², con la superficie total (decisión del 2026-10-19). Sin precio o sin superficie,
 * no hay. Redondea al centavo.
 */
export function pricePerM2Cents(
  priceCents: bigint | undefined,
  surfaceTotalM2: number | undefined,
): bigint | undefined {
  if (priceCents === undefined || surfaceTotalM2 === undefined || surfaceTotalM2 <= 0) {
    return undefined;
  }
  // La superficie puede tener decimales: se lleva a centésimos de m² para dividir en enteros.
  const hundredths = BigInt(Math.round(surfaceTotalM2 * 100));
  if (hundredths === 0n) return undefined;
  return roundedDivision(priceCents * 100n, hundredths);
}

/** La comisión estimada: el porcentaje aplicado al precio, redondeado al centavo. */
export function estimatedCommissionCents(
  priceCents: bigint | undefined,
  commissionPct: number | undefined,
): bigint | undefined {
  if (priceCents === undefined || commissionPct === undefined) return undefined;
  // El porcentaje admite hasta dos decimales: en centésimos de punto, es entero.
  const basisPoints = BigInt(Math.round(commissionPct * 100));
  return roundedDivision(priceCents * basisPoints, 10_000n);
}

/** División entera de no negativos, con la mitad hacia arriba. */
function roundedDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}
