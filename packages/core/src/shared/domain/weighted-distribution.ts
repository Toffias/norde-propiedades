/** Un agente que recibe consultas de una regla, con su peso: con 2 recibe el doble que con 1. */
export interface WeightedAgent {
  readonly userId: string;
  readonly weight: number;
}

export const MIN_AGENT_WEIGHT = 1;
export const MAX_AGENT_WEIGHT = 10;

/**
 * Qué agente recibe la consulta número `cursor` (0, 1, 2…) de una regla. Es un round robin
 * ponderado "suave": en cada vuelta de `suma de pesos` consultas, cada agente recibe tantas como su
 * peso, intercaladas (A con 2 y B con 1 → A, B, A, A, B, A…), en vez de seguidas.
 *
 * Es determinístico: depende solo del cursor y de los agentes, en su orden. La regla guarda el
 * cursor y lo avanza en cada consulta que reparte.
 */
export function pickWeighted(
  agents: readonly WeightedAgent[],
  cursor: bigint,
): WeightedAgent | undefined {
  const eligible = agents.filter((a) => a.weight > 0);
  const total = eligible.reduce((sum, a) => sum + a.weight, 0);
  if (total === 0) return undefined;

  // La secuencia se repite cada `total` consultas: alcanza con simular la vuelta en curso.
  const position = Number(cursor % BigInt(total));
  const current = eligible.map(() => 0);
  let picked = 0;
  for (let step = 0; step <= position; step++) {
    picked = 0;
    for (const [index, agent] of eligible.entries()) {
      current[index] = (current[index] ?? 0) + agent.weight;
      if ((current[index] ?? 0) > (current[picked] ?? 0)) picked = index;
    }
    current[picked] = (current[picked] ?? 0) - total;
  }
  return eligible[picked];
}
