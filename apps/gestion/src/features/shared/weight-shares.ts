/**
 * Qué parte de las consultas recibe cada agente, en %, con los pesos que se están cargando (reglas de
 * asignación y derivación por chances de un emprendimiento).
 */
export function weightShares(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (total === 0 ? 0 : Math.round((w / total) * 100)));
}
