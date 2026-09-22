/**
 * Convierte un valor a algo que `jsonb` acepta: los `bigint` (centavos) pasan a texto con
 * una marca para poder recuperarlos. `JSON.stringify` falla con `bigint`.
 */
export function toJsonb(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonb);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, toJsonb(v)]),
    );
  }
  return value;
}

/** Inversa de `toJsonb` para los `bigint`. Las fechas quedan como texto ISO. */
export function fromJsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromJsonb);
  if (typeof value === 'object' && value !== null) {
    if (
      '$bigint' in value &&
      typeof value.$bigint === 'string' &&
      Object.keys(value).length === 1
    ) {
      return BigInt(value.$bigint);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJsonb(v)]));
  }
  return value;
}
